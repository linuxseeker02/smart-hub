import mongoose, { Document, Schema } from "mongoose";

type TopicStatus = "not-started" | "in-progress" | "completed";

export interface ISyllabusTopic {
  _id?: mongoose.Types.ObjectId;
  title: string;
  description: string;
  status: TopicStatus;
  order: number;
}

export interface ISyllabusTracker extends Document {
  user: mongoose.Types.ObjectId;
  courseCode: string;
  courseName: string;
  semester: number;
  credits: number;
  topics: ISyllabusTopic[];
  overallProgress: number;
  createdAt: Date;
  updatedAt: Date;
}

const topicSchema = new Schema<ISyllabusTopic>(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["not-started", "in-progress", "completed"],
      default: "not-started",
    },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const syllabusTrackerSchema = new Schema<ISyllabusTracker>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    courseCode: { type: String, default: "" },
    courseName: { type: String, required: true },
    semester: { type: Number, required: true },
    credits: { type: Number, default: 0 },
    topics: { type: [topicSchema], default: [] },
    overallProgress: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

const SyllabusTracker = mongoose.model<ISyllabusTracker>("SyllabusTracker", syllabusTrackerSchema);

export default SyllabusTracker;
