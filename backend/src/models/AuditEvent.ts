import mongoose, { Document, Schema } from "mongoose";

export const auditActions = [
  "user_viewed",
  "user_role_changed",
  "user_status_changed",
  "user_sessions_revoked",
  "note_moderated",
  "note_deleted",
  "resource_moderated",
  "audit_log_viewed",
] as const;

export type AuditAction = (typeof auditActions)[number];

export const auditTargetTypes = [
  "user",
  "note",
  "pyq",
  "resource",
  "session",
  "audit_event",
  "platform",
] as const;

export type AuditTargetType = (typeof auditTargetTypes)[number];
export type AuditOutcome = "success" | "failure";
export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Record<string, AuditMetadataValue>;

export interface IAuditEvent extends Document {
  actorUserId: mongoose.Types.ObjectId;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  timestamp: Date;
  requestId?: string;
  metadata: AuditMetadata;
  outcome: AuditOutcome;
}

const auditEventSchema = new Schema<IAuditEvent>(
  {
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: auditActions,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: auditTargetTypes,
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      trim: true,
      maxlength: 128,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    requestId: {
      type: String,
      trim: true,
      maxlength: 128,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    outcome: {
      type: String,
      enum: ["success", "failure"],
      required: true,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

auditEventSchema.index({ timestamp: -1, action: 1 });
auditEventSchema.index({ actorUserId: 1, timestamp: -1 });
auditEventSchema.index({ targetType: 1, targetId: 1, timestamp: -1 });

const AuditEvent = mongoose.model<IAuditEvent>("AuditEvent", auditEventSchema);

export default AuditEvent;
