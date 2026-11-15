import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  noteModel: {
    create: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
  userModel: {
    findByIdAndUpdate: vi.fn(),
  },
  cloudinaryDestroy: vi.fn(),
}));

vi.mock("../src/models/Note", () => ({ default: mocks.noteModel }));
vi.mock("../src/models/User", () => ({ default: mocks.userModel }));
vi.mock("../src/config/cloudinary", () => ({
  default: {
    uploader: { destroy: mocks.cloudinaryDestroy },
    utils: {
      private_download_url: vi.fn().mockReturnValue(
        "https://api.cloudinary.test/signed-file"
      ),
    },
  },
}));
vi.mock("../src/services/extractText", () => ({
  extractTextFromUrl: vi.fn().mockResolvedValue(""),
}));
vi.mock("../src/services/aiService", () => ({
  processWithAI: vi.fn().mockResolvedValue(null),
}));
vi.mock("groq-sdk", () => ({
  default: class Groq {},
}));

import { uploadNote } from "../src/controllers/noteController";

const { noteModel, userModel, cloudinaryDestroy } = mocks;

const noteId = "507f1f77bcf86cd799439011";
const requestUserId = "507f1f77bcf86cd799439012";

const makeResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

const makeRequest = (body: Record<string, unknown>, withFile = true) =>
  ({
    body,
    user: { id: requestUserId },
    file: withFile
      ? {
          filename: "smart-hub/notes/note-123",
          path: "https://res.cloudinary.com/example/raw/upload/note-123.pdf",
          originalname: "networking.pdf",
          mimetype: "application/pdf",
        }
      : undefined,
  }) as never;

const createdNote = {
  _id: noteId,
  fileUrl: "https://res.cloudinary.com/example/raw/upload/note-123.pdf",
  filePublicId: "smart-hub/notes/note-123",
  fileType: "pdf",
  originalName: "networking.pdf",
  deliveryMode: "authenticated",
  deliveryResourceType: "image",
};

beforeEach(() => {
  vi.clearAllMocks();
  noteModel.findByIdAndDelete.mockResolvedValue(createdNote);
  userModel.findByIdAndUpdate.mockResolvedValue({});
  cloudinaryDestroy.mockResolvedValue({ result: "ok" });
});

describe("uploadNote validation and cleanup", () => {
  it.each([
    ["semester below range", { semester: "0", subject: "Networks", topic: "Routing" }],
    ["semester above range", { semester: "9", subject: "Networks", topic: "Routing" }],
    ["non-integer semester", { semester: "2.5", subject: "Networks", topic: "Routing" }],
    ["non-numeric semester", { semester: "winter", subject: "Networks", topic: "Routing" }],
    ["missing subject", { semester: "2", subject: " ", topic: "Routing" }],
    ["missing topic", { semester: "2", subject: "Networks", topic: "" }],
  ])("%s returns 400 and cleans the uploaded asset", async (_case, body) => {
    const response = makeResponse();

    await uploadNote(makeRequest(body), response as never);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(noteModel.create).not.toHaveBeenCalled();
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(cloudinaryDestroy).toHaveBeenCalledWith("smart-hub/notes/note-123", {
      resource_type: "raw",
    });
  });

  it("does not clean up when no file was uploaded", async () => {
    const response = makeResponse();

    await uploadNote(
      makeRequest({ semester: "2", subject: "Networks", topic: "Routing" }, false),
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ message: "No file uploaded" });
    expect(cloudinaryDestroy).not.toHaveBeenCalled();
  });
});

describe("uploadNote persistence rollback", () => {
  it("returns 500, deletes the note, and reconciles the user reference", async () => {
    noteModel.create.mockResolvedValue(createdNote);
    userModel.findByIdAndUpdate
      .mockRejectedValueOnce(new Error("user reference update failed"))
      .mockResolvedValueOnce({});

    const response = makeResponse();

    await uploadNote(
      makeRequest({ semester: "2", subject: "Networks", topic: "Routing" }),
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(noteModel.findByIdAndDelete).toHaveBeenCalledWith(noteId);
    expect(userModel.findByIdAndUpdate).toHaveBeenNthCalledWith(2, requestUserId, {
      $pull: { uploadedNotes: noteId },
    });
    expect(cloudinaryDestroy).toHaveBeenCalledTimes(1);
  });

  it("attempts user-reference reconciliation when note deletion fails", async () => {
    noteModel.create.mockResolvedValue(createdNote);
    userModel.findByIdAndUpdate
      .mockRejectedValueOnce(new Error("user reference update failed"))
      .mockResolvedValueOnce({});
    noteModel.findByIdAndDelete.mockRejectedValue(new Error("delete failed"));

    const response = makeResponse();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await uploadNote(
      makeRequest({ semester: "2", subject: "Networks", topic: "Routing" }),
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(userModel.findByIdAndUpdate).toHaveBeenNthCalledWith(2, requestUserId, {
      $pull: { uploadedNotes: noteId },
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "Note upload database rollback failed:",
      expect.objectContaining({ error: "delete failed" })
    );
    errorSpy.mockRestore();
  });

  it("keeps the primary failure response when user-reference reconciliation fails", async () => {
    noteModel.create.mockResolvedValue(createdNote);
    userModel.findByIdAndUpdate
      .mockRejectedValueOnce(new Error("user reference update failed"))
      .mockRejectedValueOnce(new Error("reconciliation failed"));

    const response = makeResponse();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await uploadNote(
      makeRequest({ semester: "2", subject: "Networks", topic: "Routing" }),
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: "Server error during note upload" });
    expect(cloudinaryDestroy).toHaveBeenCalledWith("smart-hub/notes/note-123", {
      resource_type: "raw",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "Note upload user-reference reconciliation failed:",
      expect.objectContaining({ error: "reconciliation failed" })
    );
    errorSpy.mockRestore();
  });

  it("does not replace the primary error when Cloudinary cleanup fails", async () => {
    noteModel.create.mockRejectedValue(new Error("database unavailable"));
    cloudinaryDestroy.mockRejectedValue(new Error("Cloudinary unavailable"));

    const response = makeResponse();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await uploadNote(
      makeRequest({ semester: "2", subject: "Networks", topic: "Routing" }),
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: "Server error during note upload" });
    expect(errorSpy).toHaveBeenCalledWith(
      "Upload note error:",
      expect.objectContaining({ message: "database unavailable" })
    );
    errorSpy.mockRestore();
  });

  it("returns 201 and does not clean up after successful persistence", async () => {
    noteModel.create.mockResolvedValue(createdNote);
    userModel.findByIdAndUpdate.mockResolvedValue({});

    const response = makeResponse();

    await uploadNote(
      makeRequest({ semester: "2", subject: " Networks ", topic: " Routing " }),
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(201);
    expect(noteModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMode: "authenticated",
        deliveryResourceType: "image",
      })
    );
    expect(response.json).toHaveBeenCalledWith({
      _id: noteId,
      fileType: "pdf",
      originalName: "networking.pdf",
    });
    expect(cloudinaryDestroy).not.toHaveBeenCalled();
  });
});
