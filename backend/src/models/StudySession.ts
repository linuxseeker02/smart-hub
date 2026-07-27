import mongoose, { Document, Schema } from "mongoose";

export interface IStudySession extends Document {
  user: mongoose.Types.ObjectId;
  subject: string;
  duration: number;
  type: "focus" | "short-break" | "long-break";
  completedAt: Date;
  date: string;
  createdAt: Date;
  updatedAt: Date;
}

const studySessionSchema = new Schema<IStudySession>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subject: {
      type: String,
      default: "General",
    },
    duration: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["focus", "short-break", "long-break"],
      default: "focus",
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
    date: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const StudySession = mongoose.model<IStudySession>("StudySession", studySessionSchema);

export default StudySession;
