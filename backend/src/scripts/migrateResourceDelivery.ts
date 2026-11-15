import "dotenv/config";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary";
import { connectDB } from "../config/db";
import Note from "../models/Note";
import PYQ from "../models/PYQ";
import {
  assertAtlasMigrationAuthorization,
  assertLocalMongoUri,
  parseResourceAllowlist,
  ResourceInventoryRecord,
} from "../utils/resourceDeliveryMigration";
import { fetchAndVerifyPdfPrefix } from "../utils/resourceFormatVerification";

const APPROVED_ATLAS_NOTE_IDS = [
  "69d886594d7118701ec5f78a",
  "69e5ce605422f67295d97341",
  "69e5d2b95422f67295d973d5",
  "69e72d2a75a40d52c393ad0d",
  "69e74b86ab4d71192f311665",
  "6a738a408997023bc7fcbddc",
  "6a7a212916922f770be7342d",
  "6aba47b981f7ba1338ad27e7",
  "6acd3cd9b214e74a893f54fc",
] as const;

type ProviderState =
  | {
      status: "raw-upload" | "raw-authenticated";
      publicId?: string;
      resourceType?: string;
      format?: string;
    }
  | { status: "missing" }
  | { status: "lookup-failed"; reason: string };

type RenameOptions = {
  resource_type: "raw";
  type: "upload" | "authenticated";
  to_type: "authenticated" | "upload";
  overwrite: false;
  invalidate: true;
};

type NoteState = {
  id: string;
  filePublicId?: string;
  fileType?: "pdf" | "docx" | "ppt";
  moderationStatus?: string;
  deliveryMode?: "authenticated" | "legacy-public";
  deliveryResourceType?: "image" | "raw";
};

type MigrationOutcome = {
  result: "migrated" | "dry-run" | "skipped" | "failed" | "manual-intervention";
  reason?: string;
  rollback?: string;
  observedStates?: {
    database: string;
    provider: string;
  };
};

type MigrationOperations = {
  readNote: (id: string) => Promise<NoteState | null>;
  updateNote: (
    record: ResourceInventoryRecord,
    expected: NoteState,
    target: NoteState
  ) => Promise<number>;
  readProvider: typeof readProviderState;
  rename: typeof renameDeliveryType;
};

const isApply = process.argv.includes("--apply");
const isAtlas = process.argv.includes("--atlas");

const getConfiguredMongoUri = (): string => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MongoDB URI is not configured");
  return uri;
};

const isNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    error?: { http_code?: number };
    http_code?: number;
  };
  return candidate.error?.http_code === 404 || candidate.http_code === 404;
};

const providerErrorMessage = (error: unknown): string => {
  if (!error || typeof error !== "object") return "provider lookup failed";
  const candidate = error as {
    error?: { http_code?: number };
    http_code?: number;
  };
  const code = candidate.error?.http_code ?? candidate.http_code;
  return code ? `provider lookup failed with status ${code}` : "provider lookup failed";
};

const readProviderState = async (
  publicId: string,
  type: "upload" | "authenticated"
): Promise<ProviderState> => {
  try {
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: "raw",
      type,
    });
    return {
      status: type === "upload" ? "raw-upload" : "raw-authenticated",
      publicId: resource.public_id,
      resourceType: resource.resource_type,
      format: resource.format,
    };
  } catch (error) {
    if (isNotFound(error)) return { status: "missing" };
    return { status: "lookup-failed", reason: providerErrorMessage(error) };
  }
};

const renameDeliveryType = (
  publicId: string,
  options: RenameOptions
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    type RenameFunction = (
      fromPublicId: string,
      toPublicId: string,
      renameOptions: RenameOptions,
      callback: (error: unknown, result: unknown) => void
    ) => void;

    // cloudinary@1.41.3 runtime accepts callback before options.
    const rename = cloudinary.uploader.rename as unknown as RenameFunction;
    rename(
      publicId,
      publicId,
      options,
      (error, result) => (error ? reject(error) : resolve(result))
    );
  });

const exactFieldFilter = (field: string, value: unknown) => ({
  [field]: value === undefined ? { $exists: false } : value,
});

export const noteSnapshotMatches = (
  record: ResourceInventoryRecord,
  current: NoteState
): boolean =>
  current.id === record.id &&
  current.filePublicId === record.filePublicId &&
  current.fileType === record.fileType &&
  current.moderationStatus === record.moderationStatus &&
  current.deliveryMode === record.deliveryMode &&
  current.deliveryResourceType === record.deliveryResourceType;

const noteStateLabel = (state: NoteState | null): string =>
  state
    ? JSON.stringify({
        id: state.id,
        filePublicId: state.filePublicId ?? "missing",
        fileType: state.fileType ?? "missing",
        moderationStatus: state.moderationStatus ?? "missing",
        deliveryMode: state.deliveryMode ?? "missing",
        deliveryResourceType: state.deliveryResourceType ?? "missing",
      })
    : "missing";

const providerStateLabel = (state: ProviderState): string =>
  state.status === "lookup-failed"
    ? state.status
    : state.status;

const updateNoteMetadata = async (
  record: ResourceInventoryRecord,
  expected: NoteState = {
    id: record.id,
    filePublicId: record.filePublicId,
    fileType: record.fileType,
    moderationStatus: record.moderationStatus,
    deliveryMode: record.deliveryMode,
    deliveryResourceType: record.deliveryResourceType,
  },
  target: NoteState = {
    id: record.id,
    filePublicId: record.filePublicId,
    fileType: record.fileType,
    moderationStatus: record.moderationStatus,
    deliveryMode: "authenticated",
    deliveryResourceType: "raw",
  }
): Promise<number> => {
  const filter = {
    _id: expected.id,
    ...exactFieldFilter("filePublicId", expected.filePublicId),
    ...exactFieldFilter("fileType", expected.fileType),
    ...exactFieldFilter("moderationStatus", expected.moderationStatus),
    ...exactFieldFilter("deliveryMode", expected.deliveryMode),
    ...exactFieldFilter(
      "deliveryResourceType",
      expected.deliveryResourceType
    ),
  };
  const update: {
    $set: Record<string, unknown>;
    $unset?: Record<string, 1>;
  } = {
    $set: {},
  };
  if (target.deliveryMode === undefined) {
    update.$unset = { deliveryMode: 1 };
  } else {
    update.$set.deliveryMode = target.deliveryMode;
  }
  if (target.deliveryResourceType === undefined) {
    update.$unset = { ...(update.$unset ?? {}), deliveryResourceType: 1 };
  } else {
    update.$set.deliveryResourceType = target.deliveryResourceType;
  }

  if (record.resourceType === "note") {
    const result = await Note.updateOne(filter, update);
    return result.modifiedCount;
  }
  const result = await PYQ.updateOne(filter, update);
  return result.modifiedCount;
};

const readRecords = async (): Promise<ResourceInventoryRecord[]> => {
  const noteFilter = isAtlas
    ? { _id: { $in: parseResourceAllowlist(process.env.RESOURCE_DELIVERY_ATLAS_NOTE_ALLOWLIST ?? "") } }
    : {};

  const [notes, pyqs] = await Promise.all([
    Note.find(noteFilter)
      .select(
        "_id fileUrl filePublicId fileType originalName moderationStatus deliveryMode deliveryResourceType"
      )
      .lean(),
    isAtlas
      ? Promise.resolve([])
      : PYQ.find()
          .select(
            "_id fileUrl filePublicId moderationStatus deliveryMode deliveryResourceType"
          )
          .lean(),
  ]);

  return [
    ...notes.map((resource) => ({
      resourceType: "note" as const,
      id: String(resource._id),
      fileUrl: resource.fileUrl,
      filePublicId: resource.filePublicId,
      fileType: resource.fileType,
      originalName: resource.originalName,
      moderationStatus: resource.moderationStatus,
      deliveryMode: resource.deliveryMode,
      deliveryResourceType: resource.deliveryResourceType,
    })),
    ...pyqs.map((resource) => ({
      resourceType: "pyq" as const,
      id: String(resource._id),
      fileUrl: resource.fileUrl,
      filePublicId: resource.filePublicId,
      moderationStatus: resource.moderationStatus,
      deliveryMode: resource.deliveryMode,
      deliveryResourceType: resource.deliveryResourceType,
    })),
  ];
};

const readNoteState = async (id: string): Promise<NoteState | null> => {
  const note = await Note.findById(id)
    .select(
      "_id filePublicId fileType moderationStatus deliveryMode deliveryResourceType"
    )
    .lean();
  if (!note) return null;
  return {
    id: String(note._id),
    filePublicId: note.filePublicId,
    fileType: note.fileType,
    moderationStatus: note.moderationStatus,
    deliveryMode: note.deliveryMode,
    deliveryResourceType: note.deliveryResourceType,
  };
};

const isAuthenticatedProvider = (
  state: ProviderState,
  publicId: string
): boolean =>
  state.status === "raw-authenticated" &&
  state.publicId === publicId &&
  state.resourceType === "raw";

const isUploadProvider = (
  state: ProviderState,
  publicId: string
): boolean =>
  state.status === "raw-upload" &&
  state.publicId === publicId &&
  state.resourceType === "raw";

export const reconcileMigrationFailure = async (
  record: ResourceInventoryRecord,
  original: NoteState,
  operations: MigrationOperations
): Promise<MigrationOutcome> => {
  const currentDatabase = await operations.readNote(record.id);
  const authenticatedProvider = record.filePublicId
    ? await operations.readProvider(record.filePublicId, "authenticated")
    : { status: "missing" as const };

  if (
    currentDatabase?.deliveryMode === "authenticated" &&
    currentDatabase.deliveryResourceType === "raw" &&
    record.filePublicId &&
    isAuthenticatedProvider(authenticatedProvider, record.filePublicId)
  ) {
    return {
      result: "migrated",
      reason: "verification failed after both systems reached authenticated state",
      observedStates: {
        database: noteStateLabel(currentDatabase),
        provider: providerStateLabel(authenticatedProvider),
      },
    };
  }

  if (currentDatabase && noteSnapshotMatches(record, currentDatabase)) {
    if (
      record.filePublicId &&
      isAuthenticatedProvider(authenticatedProvider, record.filePublicId)
    ) {
      try {
        await operations.rename(record.filePublicId, {
          resource_type: "raw",
          type: "authenticated",
          to_type: "upload",
          overwrite: false,
          invalidate: true,
        });
      } catch {
        return {
          result: "manual-intervention",
          reason:
            "MANUAL INTERVENTION REQUIRED: provider rollback failed and was not verified",
          observedStates: {
            database: noteStateLabel(currentDatabase),
            provider: providerStateLabel(authenticatedProvider),
          },
        };
      }

      const uploadProvider = await operations.readProvider(
        record.filePublicId,
        "upload"
      );
      if (isUploadProvider(uploadProvider, record.filePublicId)) {
        return {
          result: "failed",
          reason: "provider rollback verified; database remained unchanged",
          rollback: "provider rollback verified",
          observedStates: {
            database: noteStateLabel(currentDatabase),
            provider: providerStateLabel(uploadProvider),
          },
        };
      }
      return {
        result: "manual-intervention",
        reason:
          "MANUAL INTERVENTION REQUIRED: provider rollback verification failed and could not be verified",
        observedStates: {
          database: noteStateLabel(currentDatabase),
          provider: providerStateLabel(uploadProvider),
        },
      };
    }

    const uploadProvider = record.filePublicId
      ? await operations.readProvider(record.filePublicId, "upload")
      : { status: "missing" as const };
    if (
      record.filePublicId &&
      isUploadProvider(uploadProvider, record.filePublicId)
    ) {
      return {
        result: "failed",
        reason: "database update did not persist; original states verified",
        rollback: "provider rollback verified",
        observedStates: {
          database: noteStateLabel(currentDatabase),
          provider: providerStateLabel(uploadProvider),
        },
      };
    }
  }

  if (
    !currentDatabase ||
    !record.filePublicId ||
    currentDatabase.filePublicId !== original.filePublicId ||
    currentDatabase.deliveryMode !== "authenticated" ||
    currentDatabase.deliveryResourceType !== "raw"
  ) {
    return {
      result: "manual-intervention",
      reason: "MANUAL INTERVENTION REQUIRED: database state is not safely restorable",
      observedStates: {
        database: noteStateLabel(currentDatabase),
        provider: providerStateLabel(authenticatedProvider),
      },
    };
  }

  const restored = await operations.updateNote(
    record,
    currentDatabase,
    original
  );
  const restoredDatabase = await operations.readNote(record.id);
  if (
    restored !== 1 ||
    !restoredDatabase ||
    !noteSnapshotMatches(record, restoredDatabase)
  ) {
    return {
      result: "manual-intervention",
      reason:
        "MANUAL INTERVENTION REQUIRED: database restoration failed or could not be verified",
      observedStates: {
        database: noteStateLabel(restoredDatabase),
        provider: providerStateLabel(authenticatedProvider),
      },
    };
  }

  if (isAuthenticatedProvider(authenticatedProvider, record.filePublicId)) {
    try {
      await operations.rename(record.filePublicId, {
        resource_type: "raw",
        type: "authenticated",
        to_type: "upload",
        overwrite: false,
        invalidate: true,
      });
    } catch {
      return {
        result: "manual-intervention",
        reason:
          "MANUAL INTERVENTION REQUIRED: provider rollback failed and was not verified",
        observedStates: {
          database: noteStateLabel(restoredDatabase),
          provider: providerStateLabel(authenticatedProvider),
        },
      };
    }
  }

  const finalProvider = await operations.readProvider(
    record.filePublicId,
    "upload"
  );
  const finalDatabase = await operations.readNote(record.id);
  if (
    !finalDatabase ||
    !noteSnapshotMatches(record, finalDatabase) ||
    !isUploadProvider(finalProvider, record.filePublicId)
  ) {
    return {
      result: "manual-intervention",
      reason:
        "MANUAL INTERVENTION REQUIRED: compensation state could not be verified",
      observedStates: {
        database: noteStateLabel(finalDatabase),
        provider: providerStateLabel(finalProvider),
      },
    };
  }

  return {
    result: "failed",
    reason: "migration compensated; original database and provider states verified",
    rollback: "provider rollback verified",
    observedStates: {
      database: noteStateLabel(finalDatabase),
      provider: providerStateLabel(finalProvider),
    },
  };
};

const migrate = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Resource delivery migration is disabled in production.");
  }

  const uri = getConfiguredMongoUri();
  if (isAtlas) {
    const allowlist = parseResourceAllowlist(
      process.env.RESOURCE_DELIVERY_ATLAS_NOTE_ALLOWLIST ?? ""
    );
    if (!isApply) {
      if (
        process.env.RESOURCE_DELIVERY_ATLAS_MIGRATION_CONFIRM !==
        "prepare-atlas-test"
      ) {
        throw new Error(
          "Set RESOURCE_DELIVERY_ATLAS_MIGRATION_CONFIRM=prepare-atlas-test for Atlas dry-run."
        );
      }
    } else if (
      process.env.RESOURCE_DELIVERY_ATLAS_MIGRATION_CONFIRM !==
      "apply-atlas-test"
    ) {
      throw new Error(
        "Set RESOURCE_DELIVERY_ATLAS_MIGRATION_CONFIRM=apply-atlas-test for Atlas apply."
      );
    }
    if (
      isApply &&
      process.env.CLOUDINARY_MIGRATION_CONFIRM !== "apply-provider"
    ) {
      throw new Error(
        "Set CLOUDINARY_MIGRATION_CONFIRM=apply-provider to enable provider changes."
      );
    }
    await connectDB();
    assertAtlasMigrationAuthorization(
      uri,
      mongoose.connection.name,
      process.env.RESOURCE_DELIVERY_ATLAS_HOST_CONFIRM ?? "",
      process.env.RESOURCE_DELIVERY_ATLAS_DATABASE_CONFIRM ?? "",
      allowlist,
      APPROVED_ATLAS_NOTE_IDS
    );
  } else {
    assertLocalMongoUri(uri);
    if (isApply && process.env.RESOURCE_DELIVERY_MIGRATION_CONFIRM !== "apply-local") {
      throw new Error(
        "Set RESOURCE_DELIVERY_MIGRATION_CONFIRM=apply-local to enable migration."
      );
    }
    if (isApply && process.env.CLOUDINARY_MIGRATION_CONFIRM !== "apply-provider") {
      throw new Error(
        "Set CLOUDINARY_MIGRATION_CONFIRM=apply-provider to enable provider changes."
      );
    }
    await connectDB();
  }

  const records = await readRecords();
  if (isAtlas) {
    const allowlist = new Set(
      parseResourceAllowlist(process.env.RESOURCE_DELIVERY_ATLAS_NOTE_ALLOWLIST ?? "")
    );
    if (
      records.length !== allowlist.size ||
      records.some((record) => !allowlist.has(record.id))
    ) {
      throw new Error("Atlas query returned a record outside the explicit allowlist");
    }
  }

  const results: Array<Record<string, unknown>> = [];
  for (const record of records) {
    const result: Record<string, unknown> = {
      resourceType: record.resourceType,
      id: record.id,
      expectedCurrentState: {
        deliveryMode: record.deliveryMode ?? "missing",
        deliveryResourceType: record.deliveryResourceType ?? "missing",
      },
    };

    if (!record.filePublicId) {
      result.eligibility = "ineligible";
      result.result = "skipped";
      result.reason = "missing Cloudinary public ID";
      results.push(result);
      continue;
    }
    if (
      record.moderationStatus === "rejected" ||
      record.moderationStatus === "removed"
    ) {
      result.eligibility = "ineligible";
      result.result = "skipped";
      result.reason = "resource is rejected or removed";
      results.push(result);
      continue;
    }
    if (record.resourceType === "note" && record.fileType !== "pdf") {
      result.eligibility = "ineligible";
      result.result = "skipped";
      result.reason = "migration is limited to PDF resources";
      results.push(result);
      continue;
    }
    if (
      record.deliveryMode === "authenticated" &&
      record.deliveryResourceType === "raw"
    ) {
      const state = await readProviderState(record.filePublicId, "authenticated");
      result.verifiedProviderState = state.status;
      result.eligibility =
        state.status === "raw-authenticated" ? "already-migrated" : "ineligible";
      result.result = "skipped";
      result.reason =
        state.status === "raw-authenticated"
          ? "already authenticated and verified"
          : "database metadata does not match provider state";
      results.push(result);
      continue;
    }

    const publicState = await readProviderState(record.filePublicId, "upload");
    result.verifiedProviderState = publicState.status;
    if (publicState.status === "lookup-failed") {
      result.eligibility = "ineligible";
      result.result = "failed";
      result.reason = publicState.reason;
      results.push(result);
      continue;
    }
    if (publicState.status === "missing") {
      const authenticatedState = await readProviderState(
        record.filePublicId,
        "authenticated"
      );
      result.verifiedProviderState = authenticatedState.status;
      result.eligibility = "ineligible";
      result.result = "skipped";
      result.reason =
        authenticatedState.status === "raw-authenticated"
          ? "provider is authenticated but database metadata is inconsistent"
          : "raw/upload provider asset was not found";
      results.push(result);
      continue;
    }
    if (
      publicState.publicId !== record.filePublicId ||
      publicState.resourceType !== "raw"
    ) {
      result.eligibility = "ineligible";
      result.result = "skipped";
      result.reason = "provider public ID or resource type mismatch";
      results.push(result);
      continue;
    }
    if (
      publicState.format &&
      publicState.format.toLowerCase() !== "pdf"
    ) {
      result.eligibility = "ineligible";
      result.result = "skipped";
      result.reason = "provider format was verified as non-PDF";
      results.push(result);
      continue;
    }

    const providerUrl = cloudinary.url(record.filePublicId, {
      resource_type: "raw",
      type: "upload",
      secure: true,
    });
    const formatVerification = await fetchAndVerifyPdfPrefix(providerUrl);
    result.formatVerification = formatVerification.status;
    if (formatVerification.status !== "verified-pdf") {
      result.eligibility = "ineligible";
      result.result = "skipped";
      result.reason = formatVerification.reason;
      results.push(result);
      continue;
    }

    if (record.resourceType === "note") {
      const latestNote = await readNoteState(record.id);
      if (!latestNote || !noteSnapshotMatches(record, latestNote)) {
        result.eligibility = "ineligible";
        result.result = "skipped";
        result.reason =
          "concurrency conflict: Note changed during eligibility inspection";
        results.push(result);
        continue;
      }

      const latestProvider = await readProviderState(
        record.filePublicId,
        "upload"
      );
      if (!isUploadProvider(latestProvider, record.filePublicId)) {
        result.eligibility = "ineligible";
        result.result = "skipped";
        result.reason =
          "provider state changed during eligibility inspection";
        result.verifiedProviderState = latestProvider.status;
        results.push(result);
        continue;
      }

      const latestFormatVerification = await fetchAndVerifyPdfPrefix(
        cloudinary.url(record.filePublicId, {
          resource_type: "raw",
          type: "upload",
          secure: true,
        })
      );
      if (latestFormatVerification.status !== "verified-pdf") {
        result.eligibility = "ineligible";
        result.result = "skipped";
        result.reason = latestFormatVerification.reason;
        result.formatVerification = latestFormatVerification.status;
        results.push(result);
        continue;
      }
    }

    result.eligibility = "eligible";
    result.plannedOperation = "raw/upload -> raw/authenticated";
    if (!isApply) {
      result.result = "dry-run";
      results.push(result);
      continue;
    }

    let providerMigrated = false;
    try {
      await renameDeliveryType(record.filePublicId, {
        resource_type: "raw",
        type: "upload",
        to_type: "authenticated",
        overwrite: false,
        invalidate: true,
      });
      providerMigrated = true;

      const authenticatedState = await readProviderState(
        record.filePublicId,
        "authenticated"
      );
      result.verifiedProviderState = authenticatedState.status;
      if (
        authenticatedState.status !== "raw-authenticated" ||
        authenticatedState.publicId !== record.filePublicId ||
        authenticatedState.resourceType !== "raw"
      ) {
        throw new Error("post-migration provider verification failed");
      }

      const modifiedCount = await updateNoteMetadata(record);
      if (modifiedCount !== 1) {
        throw new Error("conditional database metadata update did not match");
      }

      const updated = await Note.findById(record.id)
        .select("filePublicId deliveryMode deliveryResourceType")
        .lean();
      if (
        !updated ||
        updated.filePublicId !== record.filePublicId ||
        updated.deliveryMode !== "authenticated" ||
        updated.deliveryResourceType !== "raw"
      ) {
        throw new Error("post-migration database verification failed");
      }
      result.result = "migrated";
    } catch (error) {
      if (providerMigrated && record.resourceType === "note") {
        const recovery = await reconcileMigrationFailure(
          record,
          {
            id: record.id,
            filePublicId: record.filePublicId,
            fileType: record.fileType,
            moderationStatus: record.moderationStatus,
            deliveryMode: record.deliveryMode,
            deliveryResourceType: record.deliveryResourceType,
          },
          {
            readNote: readNoteState,
            updateNote: updateNoteMetadata,
            readProvider: readProviderState,
            rename: renameDeliveryType,
          }
        );
        result.rollback = recovery.rollback;
        result.observedStates = recovery.observedStates;
        if (recovery.result === "migrated") {
          result.result = "migrated";
          result.reason = recovery.reason;
          results.push(result);
          continue;
        }
        if (recovery.result === "manual-intervention") {
          result.result = recovery.result;
          result.reason = recovery.reason;
          results.push(result);
          continue;
        }
      }
      result.result = "failed";
      result.reason =
        error instanceof Error ? error.message : "migration failed";
    }
    results.push(result);
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !isApply,
        databaseTarget: isAtlas ? "mongodb-atlas" : "localhost",
        databaseName: mongoose.connection.name,
        resources: results,
      },
      null,
      2
    )
  );
};

if (require.main === module) {
  migrate()
    .catch((error) => {
      console.error("Resource delivery migration failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

