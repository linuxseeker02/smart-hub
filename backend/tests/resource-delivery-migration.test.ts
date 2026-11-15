import { describe, expect, it } from "vitest";
import {
  assertAtlasMongoUri,
  assertAtlasMigrationAuthorization,
  assertLocalMongoUri,
  classifyResource,
  classifyProviderAsset,
  parseResourceAllowlist,
} from "../src/utils/resourceDeliveryMigration";
import {
  noteSnapshotMatches,
  reconcileMigrationFailure,
} from "../src/scripts/migrateResourceDelivery";
import {
  fetchAndVerifyPdfPrefix,
  isPdfMagicBytes,
  verifyPdfPrefix,
} from "../src/utils/resourceFormatVerification";
import fs from "node:fs";
import path from "node:path";

describe("resource delivery migration classification", () => {
  const record = {
    resourceType: "note" as const,
    id: "note-1",
    filePublicId: "notes/one",
    fileType: "pdf" as const,
    moderationStatus: "approved",
    deliveryMode: undefined,
    deliveryResourceType: undefined,
  };

  const original = {
    id: record.id,
    filePublicId: record.filePublicId,
    fileType: record.fileType,
    moderationStatus: record.moderationStatus,
    deliveryMode: undefined,
    deliveryResourceType: undefined,
  };

  const authenticated = {
    id: record.id,
    filePublicId: record.filePublicId,
    fileType: record.fileType,
    moderationStatus: record.moderationStatus,
    deliveryMode: "authenticated" as const,
    deliveryResourceType: "raw" as const,
  };

  const rawUpload = {
    status: "raw-upload" as const,
    publicId: record.filePublicId,
    resourceType: "raw",
  };
  const rawAuthenticated = {
    status: "raw-authenticated" as const,
    publicId: record.filePublicId,
    resourceType: "raw",
  };

  it("detects moderation and public-ID changes in the final Note snapshot", () => {
    expect(noteSnapshotMatches(record, original)).toBe(true);
    expect(
      noteSnapshotMatches(record, {
        ...original,
        moderationStatus: "removed",
      })
    ).toBe(false);
    expect(
      noteSnapshotMatches(record, {
        ...original,
        filePublicId: "notes/changed",
      })
    ).toBe(false);
  });

  it("reports a manual intervention when a concurrent Note change blocks recovery", async () => {
    const result = await reconcileMigrationFailure(record, original, {
      readNote: async () => ({ ...original, moderationStatus: "removed" }),
      updateNote: async () => 0,
      readProvider: async () => rawAuthenticated,
      rename: async () => undefined,
    });

    expect(result.result).toBe("manual-intervention");
    expect(result.reason).toContain("MANUAL INTERVENTION REQUIRED");
  });

  it("recognizes intended completion when verification failed after both systems changed", async () => {
    const result = await reconcileMigrationFailure(record, original, {
      readNote: async () => authenticated,
      updateNote: async () => 1,
      readProvider: async () => rawAuthenticated,
      rename: async () => undefined,
    });

    expect(result).toMatchObject({
      result: "migrated",
      reason: "verification failed after both systems reached authenticated state",
    });
  });

  it("restores MongoDB and verifies provider rollback", async () => {
    let provider = rawUpload;
    let database = authenticated;
    const updates: string[] = [];

    const result = await reconcileMigrationFailure(record, original, {
      readNote: async () => database,
      updateNote: async (_record, _expected, target) => {
        database = target;
        updates.push(target.deliveryMode ?? "unset");
        return 1;
      },
      readProvider: async () => provider,
      rename: async (_id, options) => {
        provider =
          options.to_type === "upload" ? rawUpload : rawAuthenticated;
      },
    });

    expect(result).toMatchObject({
      result: "failed",
      rollback: "provider rollback verified",
    });
    expect(updates).toEqual(["unset"]);
    expect(database).toEqual(original);
    expect(provider).toEqual(rawUpload);
  });

  it("requires manual intervention when database restoration fails", async () => {
    const result = await reconcileMigrationFailure(record, original, {
      readNote: async () => authenticated,
      updateNote: async () => 0,
      readProvider: async () => rawUpload,
      rename: async () => undefined,
    });

    expect(result.result).toBe("manual-intervention");
    expect(result.reason).toContain("database restoration failed");
  });

  it("requires manual intervention when provider rollback fails", async () => {
    const result = await reconcileMigrationFailure(record, original, {
      readNote: async () => original,
      updateNote: async () => {
        throw new Error("must not update unchanged database");
      },
      readProvider: async (_id, type) =>
        type === "authenticated" ? rawAuthenticated : rawUpload,
      rename: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(result.result).toBe("manual-intervention");
    expect(result.reason).toContain("provider rollback failed");
  });

  it("treats a completed migration as idempotently successful", async () => {
    const result = await reconcileMigrationFailure(record, original, {
      readNote: async () => authenticated,
      updateNote: async () => {
        throw new Error("must not update an already completed migration");
      },
      readProvider: async () => rawAuthenticated,
      rename: async () => {
        throw new Error("must not rename an already completed migration");
      },
    });

    expect(result.result).toBe("migrated");
  });

  it("recognizes PDF magic bytes independently of file extension", () => {
    expect(isPdfMagicBytes(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(verifyPdfPrefix(new TextEncoder().encode("%PDF-1.7"))).toEqual({
      status: "verified-pdf",
      evidence: "magic-bytes",
    });
    expect(isPdfMagicBytes(new TextEncoder().encode("not-a-pdf"))).toBe(false);
  });

  it("rejects a non-PDF provider prefix even when metadata could say pdf", () => {
    expect(verifyPdfPrefix(new TextEncoder().encode("PK\u0003\u0004"))).toEqual({
      status: "not-pdf",
      reason: "provider bytes do not start with %PDF-",
    });
  });

  it("keeps unavailable provider bytes unknown", async () => {
    const result = await fetchAndVerifyPdfPrefix(
      "https://provider.invalid/raw",
      async () =>
        new Response(null, {
          status: 503,
        })
    );
    expect(result).toEqual({
      status: "unknown",
      reason: "provider byte lookup failed with status 503",
    });
  });

  it("verifies a PDF prefix using a bounded response stream", async () => {
    const result = await fetchAndVerifyPdfPrefix(
      "https://provider.invalid/raw",
      async () =>
        new Response(new Blob([new TextEncoder().encode("%PDF-1.7")]), {
          status: 206,
        })
    );
    expect(result).toEqual({
      status: "verified-pdf",
      evidence: "magic-bytes",
    });
  });

  it.each([
    ["upload", "public-upload-asset"],
    ["private", "private-asset"],
    ["authenticated", "authenticated-asset"],
  ] as const)("classifies provider delivery type %s", (deliveryType, expected) => {
    expect(
      classifyProviderAsset(
        { found: true, resourceType: "image", deliveryType },
        "image"
      )
    ).toBe(expected);
  });

  it("classifies a verified raw upload as a public raw asset", () => {
    expect(
      classifyProviderAsset(
        { found: true, resourceType: "raw", deliveryType: "upload" },
        "raw"
      )
    ).toBe("public-upload-asset");
  });

  it("classifies missing and mismatched provider assets safely", () => {
    expect(classifyProviderAsset({ found: false }, "image")).toBe("missing-asset");
    expect(
      classifyProviderAsset(
        { found: true, resourceType: "raw", deliveryType: "upload" },
        "image"
      )
    ).toBe("resource-type-mismatch");
  });

  it("classifies authenticated notes as already usable", () => {
    expect(
      classifyResource({
        resourceType: "note",
        id: "note-1",
        filePublicId: "notes/one",
        fileUrl: "stored",
        fileType: "pdf",
        deliveryMode: "authenticated",
        deliveryResourceType: "image",
        moderationStatus: "approved",
      }).classification
    ).toBe("authenticated");
  });

  it("classifies explicit legacy public resources as migratable candidates", () => {
    const resource = classifyResource({
      resourceType: "pyq",
      id: "pyq-1",
      filePublicId: "pyqs/one",
      fileUrl: "stored",
      deliveryMode: "legacy-public",
      deliveryResourceType: "image",
      moderationStatus: "approved",
    });

    expect(resource.classification).toBe("legacy-public");
    expect(resource.expectedDeliveryResourceType).toBe("image");
  });

  it("does not infer delivery mode from a missing metadata field", () => {
    expect(
      classifyResource({
        resourceType: "note",
        id: "note-2",
        filePublicId: "notes/two",
        fileUrl: "stored",
        fileType: "docx",
      }).classification
    ).toBe("missing-delivery-metadata");
  });

  it("detects missing assets and inconsistent resource types", () => {
    expect(
      classifyResource({
        resourceType: "pyq",
        id: "pyq-2",
        deliveryMode: "legacy-public",
        deliveryResourceType: "image",
        fileUrl: "stored",
      }).classification
    ).toBe("missing-cloudinary-asset");

    expect(
      classifyResource({
        resourceType: "note",
        id: "note-3",
        filePublicId: "notes/three",
        fileUrl: "stored",
        fileType: "pdf",
        deliveryMode: "authenticated",
        deliveryResourceType: "raw",
      }).classification
    ).toBe("inconsistent-metadata");
  });
});

describe("resource delivery migration database guard", () => {
  it.each(["mongodb://localhost:27017/smart-hub", "mongodb://127.0.0.1:27018/test"])(
    "accepts local URI %s",
    (uri) => {
      expect(() => assertLocalMongoUri(uri)).not.toThrow();
    }
  );

  it.each([
    "mongodb+srv://cluster.example/smart-hub",
    "mongodb://remote.example/smart-hub",
  ])("rejects non-local URI %s", (uri) => {
    expect(() => assertLocalMongoUri(uri)).toThrow(
      "requires a localhost MongoDB URI"
    );
  });

  it("accepts an Atlas SRV URI without exposing or parsing credentials", () => {
    expect(() =>
      assertAtlasMongoUri(
        "mongodb+srv://user:password@cluster.example.mongodb.net/app"
      )
    ).not.toThrow();
  });

  it("requires the intended Atlas database, exact host, and exact allowlist", () => {
    const ids = [
      "69d886594d7118701ec5f78a",
      "69e5ce605422f67295d97341",
    ];
    expect(() =>
      assertAtlasMigrationAuthorization(
        "mongodb+srv://cluster.example.mongodb.net/test",
        "test",
        "cluster.example.mongodb.net",
        "test",
        ids,
        ids
      )
    ).not.toThrow();
    expect(() =>
      assertAtlasMigrationAuthorization(
        "mongodb+srv://cluster.example.mongodb.net/test",
        "other",
        "cluster.example.mongodb.net",
        "test",
        ids,
        ids
      )
    ).toThrow("Smart-Hub test database");
    expect(() =>
      assertAtlasMigrationAuthorization(
        "mongodb+srv://cluster.example.mongodb.net/test",
        "test",
        "other.example.mongodb.net",
        "test",
        ids,
        ids
      )
    ).toThrow("host confirmation");
    expect(() =>
      assertAtlasMigrationAuthorization(
        "mongodb+srv://cluster.example.mongodb.net/test",
        "test",
        "cluster.example.mongodb.net",
        "test",
        [...ids, "69e5d2b95422f67295d973d5"],
        ids
      )
    ).toThrow("allowlist");
  });

  it("parses and de-duplicates explicit resource allowlists", () => {
    expect(
      parseResourceAllowlist(
        "69d886594d7118701ec5f78a,69d886594d7118701ec5f78a"
      )
    ).toEqual(["69d886594d7118701ec5f78a"]);
    expect(() => parseResourceAllowlist("not-an-id")).toThrow(
      "valid MongoDB IDs"
    );
  });

  it("keeps the provider verifier read-only", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/scripts/verifyCloudinaryResourceDelivery.ts"
      ),
      "utf8"
    );

    expect(source).toContain("cloudinary.api.resource");
    expect(source).not.toMatch(/cloudinary\.uploader\.(upload|rename|destroy|explicit)/);
    expect(source).not.toMatch(/\.(updateOne|findOneAndUpdate|deleteOne|insertMany|bulkWrite)\(/);
    expect(source).not.toContain("private_download_url");
    expect(source).not.toContain("cloudinary.url");

    const migrationSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/scripts/migrateResourceDelivery.ts"),
      "utf8"
    );
    expect(migrationSource).toContain('resource_type: "raw"');
    expect(migrationSource).toContain('to_type: "authenticated"');
    expect(migrationSource).toContain("invalidate: true");
    expect(migrationSource).toContain("conditional database metadata update did not match");
    expect(migrationSource).toContain("provider rollback verification failed");
    expect(migrationSource).toContain("rejected or removed");
  });

  it.each([
    "mongodb://localhost:27017/smart-hub",
    "mongodb://remote.example/smart-hub",
    "mongodb+srv://cluster.example/not-atlas",
  ])("rejects non-Atlas inventory targets: %s", (uri) => {
    expect(() => assertAtlasMongoUri(uri)).toThrow(
      "requires a MongoDB Atlas SRV URI"
    );
  });
});
