import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Schema } from "mongoose";

const mocks = vi.hoisted(() => ({
  noteFind: vi.fn(),
  noteFindOne: vi.fn(),
  noteCountDocuments: vi.fn(),
  pyqFindOne: vi.fn(),
  pyqCreate: vi.fn(),
  privateDownloadUrl: vi.fn(),
  cloudinaryUrl: vi.fn(),
}));

vi.mock("../src/models/Note", () => ({
  default: {
    find: mocks.noteFind,
    findOne: mocks.noteFindOne,
    countDocuments: mocks.noteCountDocuments,
  },
}));
vi.mock("../src/models/PYQ", () => ({
  default: { findOne: mocks.pyqFindOne, create: mocks.pyqCreate },
}));
vi.mock("../src/config/cloudinary", () => ({
  default: {
    utils: { private_download_url: mocks.privateDownloadUrl },
    url: mocks.cloudinaryUrl,
  },
}));
vi.mock("../src/services/aiService", () => ({
  processWithAI: vi.fn().mockResolvedValue(null),
}));
vi.mock("../src/services/extractText", () => ({
  extractTextFromUrl: vi.fn().mockResolvedValue(""),
}));
vi.mock("groq-sdk", () => ({
  default: class Groq {},
}));

import {
  getNoteFileUrl,
  getNoteById,
  getNotes,
  getThumbnail,
} from "../src/controllers/noteController";
import { getPYQFileUrl, uploadPYQ } from "../src/controllers/pyqController";
import {
  RESOURCE_FILE_URL_EXPIRY_SECONDS,
  removeProviderFileFields,
} from "../src/utils/resourceFileAccess";

const makeResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    send: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

const makeRequest = (id: string) => ({ params: { id } }) as never;

const resolvedQuery = (value: unknown) => ({
  select: vi.fn().mockResolvedValue(value),
});

const resolvedNoteListQuery = (value: unknown) => ({
  populate: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(value),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.privateDownloadUrl.mockReturnValue("https://api.cloudinary.test/signed-file");
  mocks.cloudinaryUrl.mockReturnValue("https://api.cloudinary.test/signed-thumbnail");
});

describe("resource file access", () => {
  it("serializes notes in listing and individual responses without throwing", async () => {
    const note = {
      _id: new mongoose.Types.ObjectId(),
      title: "Algorithms",
      fileUrl: "https://res.cloudinary.com/public",
      filePublicId: "notes/internal",
      deliveryMode: "authenticated",
      deliveryResourceType: "image",
    };
    mocks.noteCountDocuments.mockResolvedValue(1);
    mocks.noteFind.mockReturnValue(resolvedNoteListQuery([note]));
    mocks.noteFindOne.mockReturnValue({
      populate: vi.fn().mockResolvedValue(note),
    });

    const listingResponse = makeResponse();
    await getNotes({ query: {} } as never, listingResponse as never);
    expect(listingResponse.status).toHaveBeenCalledWith(200);
    expect(listingResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: [{ _id: note._id, title: "Algorithms" }],
      })
    );

    const detailResponse = makeResponse();
    await getNoteById({ params: { id: note._id.toString() } } as never, detailResponse as never);
    expect(detailResponse.status).toHaveBeenCalledWith(200);
    expect(detailResponse.json).toHaveBeenCalledWith({
      _id: note._id,
      title: "Algorithms",
    });
  });

  it("serializes a real Mongoose document with its method context intact", () => {
    const Resource = mongoose.model(
      "ResourceFileAccessRegression",
      new Schema({
        title: String,
        fileUrl: String,
        filePublicId: String,
        deliveryMode: String,
        deliveryResourceType: String,
      })
    );
    const resource = new Resource({
      title: "Algorithms",
      fileUrl: "https://res.cloudinary.com/public",
      filePublicId: "notes/internal",
      deliveryMode: "authenticated",
      deliveryResourceType: "image",
    });

    expect(removeProviderFileFields(resource)).toEqual({
      _id: resource._id,
      title: "Algorithms",
    });
  });

  it("serializes plain objects, preserves unrelated fields, and handles nullish input", () => {
    expect(
      removeProviderFileFields({
        title: "Networks",
        semester: 2,
        fileUrl: "https://res.cloudinary.com/public",
        filePublicId: "notes/internal",
        deliveryMode: "authenticated",
        deliveryResourceType: "image",
      })
    ).toEqual({ title: "Networks", semester: 2 });
    expect(removeProviderFileFields(null)).toEqual({});
    expect(removeProviderFileFields(undefined)).toEqual({});
  });

  it.each([
    ["pending", null],
    ["rejected", null],
    ["removed", null],
  ])("does not issue a URL for %s notes", async (_status, resource) => {
    mocks.noteFindOne.mockReturnValue(resolvedQuery(resource));
    const response = makeResponse();

    await getNoteFileUrl(makeRequest("note-id"), response as never);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(mocks.privateDownloadUrl).not.toHaveBeenCalled();
  });

  it("returns an actionable migration response for an approved note without delivery metadata", async () => {
    mocks.noteFindOne.mockReturnValue(
      resolvedQuery({
        filePublicId: "legacy/note",
        fileType: "pdf",
        moderationStatus: "approved",
      })
    );
    const response = makeResponse();

    await getNoteFileUrl(makeRequest("note-id"), response as never);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      code: "RESOURCE_MIGRATION_REQUIRED",
      message: "Resource delivery metadata is missing or unsafe; migration is required.",
    });
    expect(mocks.privateDownloadUrl).not.toHaveBeenCalled();
  });

  it("returns an actionable response when a note has no provider identifier", async () => {
    mocks.noteFindOne.mockReturnValue(
      resolvedQuery({
        fileType: "pdf",
        deliveryMode: "authenticated",
        deliveryResourceType: "image",
      })
    );
    const response = makeResponse();

    await getNoteFileUrl(makeRequest("note-id"), response as never);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      code: "RESOURCE_FILE_ID_MISSING",
      message: "Resource file metadata is incomplete; migration is required.",
    });
  });

  it("issues a short-lived URL only for an approved authenticated note", async () => {
    mocks.noteFindOne.mockReturnValue(
      resolvedQuery({
        filePublicId: "notes/approved",
        fileType: "pdf",
        deliveryMode: "authenticated",
        deliveryResourceType: "image",
      })
    );
    const response = makeResponse();

    await getNoteFileUrl(makeRequest("note-id"), response as never);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      url: "https://api.cloudinary.test/signed-file",
      expiresIn: RESOURCE_FILE_URL_EXPIRY_SECONDS,
    });
    expect(mocks.privateDownloadUrl).toHaveBeenCalledWith(
      "notes/approved",
      "pdf",
      expect.objectContaining({
        resource_type: "image",
        type: "authenticated",
        expires_at: expect.any(Number),
      })
    );
  });

  it("signs an approved authenticated raw PDF as a raw resource", async () => {
    mocks.noteFindOne.mockReturnValue(
      resolvedQuery({
        filePublicId: "notes/raw-approved",
        fileType: "pdf",
        deliveryMode: "authenticated",
        deliveryResourceType: "raw",
      })
    );
    const response = makeResponse();

    await getNoteFileUrl(makeRequest("note-id"), response as never);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(mocks.privateDownloadUrl).toHaveBeenCalledWith(
      "notes/raw-approved",
      "pdf",
      expect.objectContaining({
        resource_type: "raw",
        type: "authenticated",
        expires_at: expect.any(Number),
      })
    );
  });

  it("removes provider fields from PYQ upload responses", async () => {
    mocks.pyqCreate.mockResolvedValue({
      toObject: () => ({
        _id: "pyq-id",
        fileUrl: "https://res.cloudinary.com/public",
        filePublicId: "pyqs/internal",
        moderationStatus: "pending",
      }),
    });
    const response = makeResponse();
    const request = {
      body: {
        semester: "1",
        courseCode: "MATH101",
        courseName: "Mathematics",
        year: "2026",
        examType: "End Semester",
      },
      file: {
        path: "https://res.cloudinary.com/public",
        filename: "pyqs/internal",
        originalname: "paper.pdf",
        size: 10,
      },
      user: { id: "student-id" },
    };

    await uploadPYQ(request as never, response as never);

    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      _id: "pyq-id",
      moderationStatus: "pending",
    });
  });

  it.each(["pending", "rejected", "removed"])(
    "does not issue a URL for %s PYQs",
    async () => {
      mocks.pyqFindOne.mockReturnValue(resolvedQuery(null));
      const response = makeResponse();

      await getPYQFileUrl(makeRequest("pyq-id"), response as never);

      expect(response.status).toHaveBeenCalledWith(404);
      expect(mocks.privateDownloadUrl).not.toHaveBeenCalled();
    }
  );

  it("returns an actionable migration response for an approved PYQ without delivery metadata", async () => {
    mocks.pyqFindOne.mockReturnValue(
      resolvedQuery({ filePublicId: "legacy/pyq" })
    );
    const response = makeResponse();

    await getPYQFileUrl(makeRequest("pyq-id"), response as never);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      code: "RESOURCE_MIGRATION_REQUIRED",
      message: "Resource delivery metadata is missing or unsafe; migration is required.",
    });
  });

  it("issues a short-lived URL only for an approved authenticated PYQ", async () => {
    mocks.pyqFindOne.mockReturnValue(
      resolvedQuery({
        filePublicId: "pyqs/approved",
        deliveryMode: "authenticated",
        deliveryResourceType: "image",
      })
    );
    const response = makeResponse();

    await getPYQFileUrl(makeRequest("pyq-id"), response as never);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      url: "https://api.cloudinary.test/signed-file",
      expiresIn: RESOURCE_FILE_URL_EXPIRY_SECONDS,
    });
    expect(mocks.privateDownloadUrl).toHaveBeenCalledWith(
      "pyqs/approved",
      "pdf",
      expect.objectContaining({
        resource_type: "image",
        type: "authenticated",
      })
    );
  });

  it("returns an image-compatible thumbnail only for an approved authenticated PDF", async () => {
    mocks.noteFindOne.mockReturnValue(
      resolvedQuery({
        filePublicId: "notes/approved",
        fileType: "pdf",
        deliveryMode: "authenticated",
        deliveryResourceType: "image",
      })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      })
    );
    const response = makeResponse();

    await getThumbnail(makeRequest("note-id"), response as never);

    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(mocks.cloudinaryUrl).toHaveBeenCalledWith(
      "notes/approved",
      expect.objectContaining({
        resource_type: "image",
        type: "authenticated",
        sign_url: true,
      })
    );
    vi.unstubAllGlobals();
  });

  it.each(["pending", "rejected", "removed", "unknown"])(
    "denies %s thumbnail delivery",
    async () => {
      mocks.noteFindOne.mockReturnValue(
        resolvedQuery({
          filePublicId: "notes/not-visible",
          fileType: "pdf",
          deliveryMode: "unknown",
        })
      );
      const response = makeResponse();

      await getThumbnail(makeRequest("note-id"), response as never);

      expect(response.status).toHaveBeenCalledWith(404);
      expect(response.send).not.toHaveBeenCalled();
    }
  );

  it("removes provider URLs and identifiers from student-facing resources", () => {
    expect(
      removeProviderFileFields({
        _id: "resource-id",
        fileUrl: "https://res.cloudinary.com/public",
        filePublicId: "internal/id",
      })
    ).toEqual({ _id: "resource-id" });
  });
});

it("does not issue a new URL after an approved note becomes rejected", async () => {
  mocks.noteFindOne
    .mockReturnValueOnce(
      resolvedQuery({
        filePublicId: "notes/approved",
        fileType: "pdf",
        deliveryMode: "authenticated",
        deliveryResourceType: "image",
      })
    )
    .mockReturnValueOnce(resolvedQuery(null));
  const firstResponse = makeResponse();
  const secondResponse = makeResponse();

  await getNoteFileUrl(makeRequest("note-id"), firstResponse as never);
  await getNoteFileUrl(makeRequest("note-id"), secondResponse as never);

  expect(firstResponse.status).toHaveBeenCalledWith(200);
  expect(secondResponse.status).toHaveBeenCalledWith(404);
  expect(mocks.privateDownloadUrl).toHaveBeenCalledTimes(1);
});
