import type { ResourceDeliveryMode, ResourceDeliveryType } from "./resourceFileAccess";

export type ResourceKind = "note" | "pyq";
export type ResourceClassification =
  | "authenticated"
  | "legacy-public"
  | "missing-delivery-metadata"
  | "inconsistent-metadata"
  | "missing-cloudinary-asset"
  | "manual-investigation";
export type ProviderAssetClassification =
  | "public-upload-asset"
  | "private-asset"
  | "authenticated-asset"
  | "missing-asset"
  | "resource-type-mismatch"
  | "provider-lookup-failed"
  | "manual-investigation";

export interface ProviderAssetEvidence {
  found: boolean;
  resourceType?: ResourceDeliveryType;
  deliveryType?: "upload" | "private" | "authenticated" | string;
  format?: string;
}

export const classifyProviderAsset = (
  evidence: ProviderAssetEvidence,
  expectedType: ResourceDeliveryType
): ProviderAssetClassification => {
  if (!evidence.found) return "missing-asset";
  if (!evidence.resourceType || evidence.resourceType !== expectedType) {
    return "resource-type-mismatch";
  }
  if (evidence.deliveryType === "upload") return "public-upload-asset";
  if (evidence.deliveryType === "private") return "private-asset";
  if (evidence.deliveryType === "authenticated") {
    return "authenticated-asset";
  }
  return "manual-investigation";
};

export interface ResourceInventoryRecord {
  resourceType: ResourceKind;
  id: string;
  filePublicId?: string;
  fileUrl?: string;
  fileType?: "pdf" | "docx" | "ppt";
  originalName?: string;
  moderationStatus?: string;
  deliveryMode?: ResourceDeliveryMode;
  deliveryResourceType?: ResourceDeliveryType;
}

export interface ClassifiedResource extends ResourceInventoryRecord {
  classification: ResourceClassification;
  expectedDeliveryResourceType: ResourceDeliveryType;
  migrationAction: string;
  providerVerification: "not-run";
}

const isDeliveryMode = (value: unknown): value is ResourceDeliveryMode =>
  value === "authenticated" || value === "legacy-public";

const isDeliveryResourceType = (
  value: unknown
): value is ResourceDeliveryType => value === "image" || value === "raw";

export const expectedResourceType = (
  resource: ResourceInventoryRecord
): ResourceDeliveryType =>
  resource.resourceType === "pyq" || resource.fileType === "pdf"
    ? "image"
    : "raw";

export const classifyResource = (
  resource: ResourceInventoryRecord
): ClassifiedResource => {
  const expectedType = expectedResourceType(resource);
  const hasPublicId =
    typeof resource.filePublicId === "string" &&
    resource.filePublicId.trim().length > 0;
  const hasFileUrl =
    typeof resource.fileUrl === "string" && resource.fileUrl.trim().length > 0;
  const hasMode = isDeliveryMode(resource.deliveryMode);
  const hasType = isDeliveryResourceType(resource.deliveryResourceType);

  let classification: ResourceClassification;
  let migrationAction: string;

  if (!hasPublicId) {
    classification = "missing-cloudinary-asset";
    migrationAction = "locate the provider asset before migration";
  } else if (!hasMode || !hasType) {
    classification = "missing-delivery-metadata";
    migrationAction =
      "verify provider delivery type and record metadata before migration";
  } else if (resource.deliveryResourceType !== expectedType) {
    classification = "inconsistent-metadata";
    migrationAction = "manually reconcile provider type, file type, and metadata";
  } else if (resource.deliveryMode === "authenticated") {
    classification = "authenticated";
    migrationAction = "no database migration required";
  } else if (resource.deliveryMode === "legacy-public" && hasFileUrl) {
    classification = "legacy-public";
    migrationAction =
      resource.moderationStatus === "rejected" ||
      resource.moderationStatus === "removed"
        ? "do not make accessible; handle provider exposure separately"
        : "verify public provider asset, then convert delivery to authenticated";
  } else {
    classification = "manual-investigation";
    migrationAction = "verify provider asset and stored URL manually";
  }

  return {
    ...resource,
    classification,
    expectedDeliveryResourceType: expectedType,
    migrationAction,
    providerVerification: "not-run",
  };
};

export const assertLocalMongoUri = (uri: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("MongoDB URI is invalid");
  }

  if (
    parsed.protocol !== "mongodb:" ||
    !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
  ) {
    throw new Error(
      "Resource delivery migration requires a localhost MongoDB URI"
    );
  }
};

export const assertAtlasMongoUri = (uri: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("MongoDB URI is invalid");
  }

  if (
    parsed.protocol !== "mongodb+srv:" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    !parsed.hostname.endsWith(".mongodb.net")
  ) {
    throw new Error("Atlas inventory requires a MongoDB Atlas SRV URI");
  }
};

export const parseResourceAllowlist = (value: string): string[] => {
  const ids = [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0 || ids.some((id) => !/^[a-f\d]{24}$/i.test(id))) {
    throw new Error("Atlas migration allowlist must contain valid MongoDB IDs");
  }
  return ids;
};

export const assertAtlasMigrationAuthorization = (
  uri: string,
  actualDatabaseName: string,
  confirmedHost: string,
  confirmedDatabaseName: string,
  allowlist: string[],
  approvedIds: readonly string[]
): void => {
  assertAtlasMongoUri(uri);
  const host = new URL(uri).hostname;
  if (!confirmedHost || confirmedHost !== host) {
    throw new Error("Atlas migration host confirmation does not match the target");
  }
  if (confirmedDatabaseName !== "test" || actualDatabaseName !== "test") {
    throw new Error("Atlas migration is restricted to the Smart-Hub test database");
  }
  const approved = new Set(approvedIds);
  if (
    allowlist.length !== approved.size ||
    allowlist.some((id) => !approved.has(id))
  ) {
    throw new Error("Atlas migration allowlist does not match approved Note IDs");
  }
};

