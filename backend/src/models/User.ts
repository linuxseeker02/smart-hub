import mongoose, { Document, Schema } from "mongoose";

export type UserRole = "student" | "admin";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  uploadedNotes: mongoose.Types.ObjectId[];
  savedNotes: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    uploadedNotes: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Note",
      default: [],
    },
    savedNotes: {
      type: [Schema.Types.ObjectId],
      ref: "Note",
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;
