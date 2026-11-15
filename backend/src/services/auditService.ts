import mongoose, { Model } from "mongoose";
import { ClientSession } from "mongoose";
import AuditEvent, {
  AuditAction,
  AuditMetadata,
  AuditMetadataValue,
  AuditOutcome,
  AuditTargetType,
  IAuditEvent,
  auditActions,
  auditTargetTypes,
} from "../models/AuditEvent";

const allowedMetadataKeys = new Set([
  "reason",
  "previousRole",
  "newRole",
  "previousStatus",
  "newStatus",
  "moderationStatus",
  "moderationReason",
  "resourceType",
  "resultCount",
]);

const sensitiveMetadataKeys = new Set([
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "cookie",
  "authorization",
  "secret",
  "sessionTokenHash",
]);

export class AuditServiceError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "AuditServiceError";
    this.code = code;
  }
}

export type CreateAuditEventInput = {
  actorUserId: string | mongoose.Types.ObjectId;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  outcome: AuditOutcome;
  timestamp?: Date;
  session?: ClientSession;
};

const isAllowedValue = (value: unknown): value is AuditMetadataValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

export const sanitizeAuditMetadata = (
  metadata: Record<string, unknown> = {}
): AuditMetadata => {
  const sanitized: AuditMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (sensitiveMetadataKeys.has(key)) {
      throw new AuditServiceError(
        "SENSITIVE_METADATA",
        "Audit metadata contains a prohibited sensitive field."
      );
    }

    if (!allowedMetadataKeys.has(key)) {
      continue;
    }

    if (!isAllowedValue(value)) {
      throw new AuditServiceError(
        "INVALID_METADATA",
        "Audit metadata values must be scalar and non-sensitive."
      );
    }

    if (typeof value === "string" && value.length > 256) {
      throw new AuditServiceError(
        "INVALID_METADATA",
        "Audit metadata strings are too long."
      );
    }

    sanitized[key] = value;
  }

  return sanitized;
};

function assertEnumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string
): asserts value is T {
  if (!allowed.includes(value as T)) {
    throw new AuditServiceError("INVALID_FIELD", `${field} is invalid.`);
  }
}

export const createAuditEvent = async (
  input: CreateAuditEventInput,
  model: Pick<Model<IAuditEvent>, "create"> = AuditEvent
): Promise<IAuditEvent> => {
  if (!input || !input.actorUserId) {
    throw new AuditServiceError(
      "MISSING_FIELD",
      "actorUserId is required."
    );
  }

  if (!mongoose.isValidObjectId(input.actorUserId)) {
    throw new AuditServiceError("INVALID_FIELD", "actorUserId is invalid.");
  }

  if (!input.action || !input.targetType || !input.outcome) {
    throw new AuditServiceError(
      "MISSING_FIELD",
      "action, targetType, and outcome are required."
    );
  }

  assertEnumValue(input.action, auditActions, "action");
  assertEnumValue(input.targetType, auditTargetTypes, "targetType");

  if (input.outcome !== "success" && input.outcome !== "failure") {
    throw new AuditServiceError("INVALID_FIELD", "outcome is invalid.");
  }

  if (input.targetId !== undefined && input.targetId.length > 128) {
    throw new AuditServiceError("INVALID_FIELD", "targetId is too long.");
  }

  if (input.requestId !== undefined && input.requestId.length > 128) {
    throw new AuditServiceError("INVALID_FIELD", "requestId is too long.");
  }

  if (input.timestamp !== undefined && Number.isNaN(input.timestamp.getTime())) {
    throw new AuditServiceError("INVALID_FIELD", "timestamp is invalid.");
  }

  const metadata = sanitizeAuditMetadata(input.metadata);

  try {
    const event = {
      actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      requestId: input.requestId,
      metadata,
      outcome: input.outcome,
      timestamp: input.timestamp ?? new Date(),
    };

    if (input.session) {
      const created = await model.create([event], { session: input.session });
      return created[0];
    }

    return await model.create(event);
  } catch {
    throw new AuditServiceError(
      "PERSISTENCE_FAILED",
      "Audit event could not be recorded."
    );
  }
};
