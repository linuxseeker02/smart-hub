import cloudinary from "../config/cloudinary";

export const RESOURCE_FILE_URL_EXPIRY_SECONDS = 5 * 60;
export type ResourceDeliveryMode = "authenticated" | "legacy-public";
export type ResourceDeliveryType = "image" | "raw";
export type ResourceDeliveryErrorCode =
  | "RESOURCE_MIGRATION_REQUIRED"
  | "RESOURCE_FILE_ID_MISSING";

export class ResourceDeliveryError extends Error {
  constructor(
    message: string,
    public readonly code: ResourceDeliveryErrorCode
  ) {
    super(message);
    this.name = "ResourceDeliveryError";
  }
}

const extensionFor = (fileType: "pdf" | "docx" | "ppt"): string => {
  if (fileType === "pdf") return "pdf";
  if (fileType === "docx") return "docx";
  return "ppt";
};

export const createSignedResourceFileUrl = (
  filePublicId: string,
  fileType: "pdf" | "docx" | "ppt",
  deliveryMode: ResourceDeliveryMode | undefined,
  deliveryResourceType: ResourceDeliveryType | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  attachment = false
): string => {
  if (!filePublicId) {
    throw new ResourceDeliveryError(
      "Resource file metadata is incomplete; migration is required.",
      "RESOURCE_FILE_ID_MISSING"
    );
  }

  if (deliveryMode !== "authenticated" || !deliveryResourceType) {
    throw new ResourceDeliveryError(
      "Resource delivery metadata is missing or unsafe; migration is required.",
      "RESOURCE_MIGRATION_REQUIRED"
    );
  }

  return cloudinary.utils.private_download_url(filePublicId, extensionFor(fileType), {
    resource_type: deliveryResourceType,
    type: "authenticated",
    attachment,
    expires_at: nowSeconds + RESOURCE_FILE_URL_EXPIRY_SECONDS,
  });
};

export const createAuthenticatedThumbnailUrl = (
  filePublicId: string,
  deliveryMode: ResourceDeliveryMode | undefined,
  deliveryResourceType: ResourceDeliveryType | undefined
): string => {
  if (!filePublicId) {
    throw new ResourceDeliveryError(
      "Resource file metadata is incomplete; migration is required.",
      "RESOURCE_FILE_ID_MISSING"
    );
  }

  if (deliveryMode !== "authenticated" || deliveryResourceType !== "image") {
    throw new ResourceDeliveryError(
      "Resource thumbnail metadata is missing or unsafe; migration is required.",
      "RESOURCE_MIGRATION_REQUIRED"
    );
  }

  return cloudinary.url(filePublicId, {
    resource_type: "image",
    type: "authenticated",
    secure: true,
    sign_url: true,
    transformation: [{ width: 400, height: 300, crop: "fill", page: 1, fetch_format: "jpg" }],
  });
};

export const removeProviderFileFields = (
  resource: unknown
): Record<string, unknown> => {
  let value: Record<string, unknown> = {};
  if (typeof resource === "object" && resource !== null) {
    const document = resource as {
      toObject?: () => Record<string, unknown>;
    };
    value =
      typeof document.toObject === "function"
        ? document.toObject()
        : (resource as Record<string, unknown>);
  }
  const sanitized = { ...value };
  delete sanitized.fileUrl;
  delete sanitized.filePublicId;
  delete sanitized.deliveryMode;
  delete sanitized.deliveryResourceType;
  return sanitized;
};

export const removePrivateNoteFields = (
  resource: unknown
): Record<string, unknown> => {
  const sanitized = removeProviderFileFields(resource);
  delete sanitized.summary;
  delete sanitized.keywords;
  delete sanitized.quizQuestions;
  delete sanitized.ratings;
  delete sanitized.reviews;
  delete sanitized.originalName;
  return sanitized;
};

export const removePrivatePyqFields = (
  resource: unknown
): Record<string, unknown> => {
  const sanitized = removeProviderFileFields(resource);
  delete sanitized.originalName;
  delete sanitized.fileSize;
  return sanitized;
};
