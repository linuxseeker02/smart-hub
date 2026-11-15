import mongoose from "mongoose";
import dotenv from "dotenv";
import { connectDB } from "../config/db";
import Note from "../models/Note";
import PYQ from "../models/PYQ";
import {
  assertAtlasMongoUri,
  assertLocalMongoUri,
  classifyResource,
  ClassifiedResource,
  ResourceInventoryRecord,
} from "../utils/resourceDeliveryMigration";

dotenv.config();

const getConfiguredMongoUri = (): string => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MongoDB URI is not configured");
  }
  return uri;
};

const asRecord = (
  resourceType: "note" | "pyq",
  resource: {
    _id: unknown;
    filePublicId?: string;
    fileUrl?: string;
    fileType?: "pdf" | "docx" | "ppt";
    moderationStatus?: string;
    deliveryMode?: ResourceInventoryRecord["deliveryMode"];
    deliveryResourceType?: ResourceInventoryRecord["deliveryResourceType"];
  }
): ResourceInventoryRecord => ({
  resourceType,
  id: String(resource._id),
  filePublicId: resource.filePublicId,
  fileUrl: resource.fileUrl,
  fileType: resource.fileType,
  moderationStatus: resource.moderationStatus,
  deliveryMode: resource.deliveryMode,
  deliveryResourceType: resource.deliveryResourceType,
});

const summarize = (resources: ClassifiedResource[]) => ({
  total: resources.length,
  byClassification: resources.reduce<Record<string, number>>((counts, resource) => {
    counts[resource.classification] =
      (counts[resource.classification] ?? 0) + 1;
    return counts;
  }, {}),
  byModerationStatus: resources.reduce<Record<string, number>>(
    (counts, resource) => {
      const status = resource.moderationStatus ?? "legacy";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    },
    {}
  ),
  missingCloudinaryPublicIds: resources.filter(
    (resource) => !resource.filePublicId
  ).length,
});

const report = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Resource delivery reporting is disabled in production.");
  }

  const uri = getConfiguredMongoUri();
  const atlasConfirmed =
    process.env.RESOURCE_DELIVERY_ATLAS_INVENTORY_CONFIRM ===
    "read-only-atlas";
  const localConfirmed =
    process.env.RESOURCE_DELIVERY_REPORT_CONFIRM === "read-only";

  if (atlasConfirmed === localConfirmed) {
    throw new Error(
      "Provide exactly one inventory confirmation: read-only or read-only-atlas."
    );
  }

  if (atlasConfirmed) {
    assertAtlasMongoUri(uri);
  } else {
    assertLocalMongoUri(uri);
  }

  await connectDB();
  const collections = await mongoose.connection.db
    ?.listCollections({}, { nameOnly: true })
    .toArray();
  const collectionNames = new Set(
    collections?.map((collection) => collection.name) ?? []
  );

  const [notes, pyqs] = await Promise.all([
    Note.find()
      .select(
        "_id fileUrl filePublicId fileType moderationStatus deliveryMode deliveryResourceType"
      )
      .lean(),
    PYQ.find()
      .select(
        "_id fileUrl filePublicId moderationStatus deliveryMode deliveryResourceType"
      )
      .lean(),
  ]);

  const resources = [
    ...notes.map((resource) => classifyResource(asRecord("note", resource))),
    ...pyqs.map((resource) => classifyResource(asRecord("pyq", resource))),
  ];

  console.log(
    JSON.stringify(
      {
        dryRun: true,
        readOnly: true,
        databaseTarget: atlasConfirmed ? "mongodb-atlas" : "localhost",
        databaseName: mongoose.connection.name,
        collections: {
          notesAvailable: collectionNames.has("notes"),
          pyqsAvailable: collectionNames.has("pyqs"),
        },
        notes: summarize(
          resources.filter((resource) => resource.resourceType === "note")
        ),
        pyqs: summarize(
          resources.filter((resource) => resource.resourceType === "pyq")
        ),
        resources: resources.map(({ fileUrl: _fileUrl, ...resource }) => resource),
      },
      null,
      2
    )
  );
};

report()
  .catch((error) => {
    console.error("Resource delivery report failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

