import mongoose, { Document, Schema } from "mongoose";

export type SessionRevocationReason =
  | "logout"
  | "reuse_detected"
  | "password_changed"
  | "role_changed"
  | "account_disabled"
  | "manual";

export interface IAuthSession extends Document {
  userId: mongoose.Types.ObjectId;
  sessionId: string;
  familyId: string;
  currentTokenHash: string;
  currentTokenIssuedAt: Date;
  currentTokenExpiresAt: Date;
  lastUsedAt: Date;
  revokedAt?: Date;
  revokedReason?: SessionRevocationReason;
  createdAt: Date;
  updatedAt: Date;
}

export const authSessionSchema = new Schema<IAuthSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
    },
    familyId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      index: true,
    },
    currentTokenHash: {
      type: String,
      required: true,
      select: false,
    },
    currentTokenIssuedAt: {
      type: Date,
      required: true,
    },
    currentTokenExpiresAt: {
      type: Date,
      required: true,
    },
    lastUsedAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    revokedReason: {
      type: String,
      enum: [
        "logout",
        "reuse_detected",
        "password_changed",
        "role_changed",
        "account_disabled",
        "manual",
      ],
      maxlength: 32,
    },
  },
  {
    timestamps: true,
  }
);

authSessionSchema.index({ userId: 1, revokedAt: 1 });
authSessionSchema.index({ familyId: 1, revokedAt: 1 });

const AuthSession = mongoose.model<IAuthSession>("AuthSession", authSessionSchema);

export default AuthSession;
