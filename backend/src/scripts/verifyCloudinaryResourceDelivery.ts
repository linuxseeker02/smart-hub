import "dotenv/config";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary";
import { connectDB } from "../config/db";
import Note from "../models/Note";
import {
  assertAtlasMongoUri,
  classifyProviderAsset,
  expectedResourceType,
  ProviderAssetClassification,
  ResourceInventoryRecord,
} from "../utils/resourceDeliveryMigration";

const CONFIRMATION = "read-only-cloudinary";
const RESOURCE_TYPES = ["image", "raw"] as const;
const DELIVERY_TYPES = ["upload", "private", "authenticated"] as const;

type ProviderResource = {
  resource_type?: string;
  type?: string;
  format?: string;
  secure_url?: string;
  bytes?: number;
  created_at?: string;
};

type LookupFailure = {
  resourceType: string;
  deliveryType: string;
  notFound: boolean;
  statusCode?: number;
};

const getConfiguredMongoUri = (): string => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MongoDB URI is not configured");
  return uri;
};

const isNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    error?: { http_code?: number };
    http_code?: number;
  };
  return candidate.error?.http_code === 404 || candidate.http_code === 404;
};

const statusCodeOf = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    error?: { http_code?: number };
    http_code?: number;
  };
  return candidate.error?.http_code ?? candidate.http_code;
};

const verifyProviderAsset = async (
  publicId: string,
  expectedType: "image" | "raw"
): Promise<{
  classification: ProviderAssetClassification;
  evidence?: {
    resourceType: string;
    deliveryType: string;
    format?: string;
    secureUrlAvailable: boolean;
    bytes?: number;
    createdAt?: string;
  };
  failures: LookupFailure[];
}> => {
  const failures: LookupFailure[] = [];
  const matches: ProviderResource[] = [];

  for (const resourceType of RESOURCE_TYPES) {
    for (const deliveryType of DELIVERY_TYPES) {
      try {
        const resource = (await cloudinary.api.resource(publicId, {
          resource_type: resourceType,
          type: deliveryType,
        })) as ProviderResource;
        matches.push(resource);
      } catch (error) {
        failures.push({
          resourceType,
          deliveryType,
          notFound: isNotFoundError(error),
          statusCode: statusCodeOf(error),
        });
      }
    }
  }

  const match =
    matches.find((resource) => resource.resource_type === expectedType) ??
    matches[0];

  if (!match) {
    const hasNonNotFoundFailure = failures.some((failure) => !failure.notFound);
    return {
      classification: hasNonNotFoundFailure
        ? "provider-lookup-failed"
        : "missing-asset",
      failures,
    };
  }

  const classification = classifyProviderAsset(
    {
      found: true,
      resourceType:
        match.resource_type === "image" || match.resource_type === "raw"
          ? match.resource_type
          : undefined,
      deliveryType: match.type,
      format: match.format ?? "unknown",
    },
    expectedType
  );

  return {
    classification,
    evidence: {
      resourceType: match.resource_type ?? "unknown",
      deliveryType: match.type ?? "unknown",
      format: match.format ?? "unknown",
      secureUrlAvailable: typeof match.secure_url === "string",
      bytes: match.bytes,
      createdAt: match.created_at,
    },
    failures,
  };
};

const verify = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cloudinary verification is disabled in production.");
  }
  if (process.env.RESOURCE_DELIVERY_CLOUDINARY_VERIFY_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Set RESOURCE_DELIVERY_CLOUDINARY_VERIFY_CONFIRM=${CONFIRMATION} to run verification.`
    );
  }

  const uri = getConfiguredMongoUri();
  assertAtlasMongoUri(uri);
  await connectDB();

  const notes = await Note.find({
    filePublicId: { $exists: true, $ne: "" },
    $or: [
      { deliveryMode: { $exists: false } },
      { deliveryResourceType: { $exists: false } },
      { deliveryMode: "legacy-public" },
    ],
  })
    .select(
      "_id filePublicId fileType moderationStatus deliveryMode deliveryResourceType"
    )
    .lean();

  const results: Array<Record<string, unknown>> = [];
  for (const note of notes) {
    const resource: ResourceInventoryRecord = {
      resourceType: "note",
      id: String(note._id),
      filePublicId: note.filePublicId,
      fileType: note.fileType,
      moderationStatus: note.moderationStatus,
      deliveryMode: note.deliveryMode,
      deliveryResourceType: note.deliveryResourceType,
    };
    const expectedType = expectedResourceType(resource);
    const verification = await verifyProviderAsset(note.filePublicId, expectedType);

    results.push({
      resourceType: "note",
      id: String(note._id),
      cloudinaryPublicId: note.filePublicId,
      expectedResourceType: expectedType,
      moderationStatus: note.moderationStatus ?? "legacy",
      deliveryMode: note.deliveryMode ?? "unknown",
      deliveryResourceType: note.deliveryResourceType ?? "unknown",
      classification: verification.classification,
      providerEvidence: verification.evidence,
      lookupFailures: verification.failures,
    });
  }

  const counts = results.reduce<Record<string, number>>((summary, result) => {
    const classification = String(result.classification);
    summary[classification] = (summary[classification] ?? 0) + 1;
    return summary;
  }, {});

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        databaseTarget: "mongodb-atlas",
        databaseName: mongoose.connection.name,
        inspectedNotes: results.length,
        counts,
        resources: results,
      },
      null,
      2
    )
  );
};

verify()
  .catch((error) => {
    console.error("Cloudinary resource verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

