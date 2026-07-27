import mongoose, { Document, Schema } from "mongoose";

export interface IAssignment extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  subject: string;
  description: string;
  deadline: Date;
  priority: "low" | "medium" | "high";
  status: "pending" | "in-progress" | "submitted" | "graded";
  grade: string;
  reminderSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<IAssignment>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    deadline: {
      type: Date,
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "submitted", "graded"],
      default: "pending",
    },
    grade: {
      type: String,
      default: "",
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Assignment = mongoose.model<IAssignment>("Assignment", assignmentSchema);

export default Assignment;
