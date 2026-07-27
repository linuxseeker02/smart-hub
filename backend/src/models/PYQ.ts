import mongoose, { Document, Schema } from "mongoose";

export type PYQExamType =
  | "End Semester"
  | "Class Test 1 Set 1"
  | "Class Test 1 Set 2"
  | "Class Test 2 Set 1"
  | "Class Test 2 Set 2";

export interface IPYQ extends Document {
  uploadedBy: mongoose.Types.ObjectId;
  semester: number;
  courseCode: string;
  courseName: string;
  year: number;
  examType: PYQExamType;
  fileUrl: string;
  filePublicId: string;
  originalName: string;
  fileSize: number;
  downloadCount: number;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const pyqSchema = new Schema<IPYQ>(
  {
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    courseCode: {
      type: String,
      required: true,
      trim: true,
    },
    courseName: {
      type: String,
      required: true,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
      enum: [2023, 2024, 2025, 2026, 2027, 2028],
    },
    examType: {
      type: String,
      required: true,
      enum: [
        "End Semester",
        "Class Test 1 Set 1",
        "Class Test 1 Set 2",
        "Class Test 2 Set 1",
        "Class Test 2 Set 2",
      ],
    },
    fileUrl: {
      type: String,
      required: true,
    },
    filePublicId: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const PYQ = mongoose.model<IPYQ>("PYQ", pyqSchema);

export default PYQ;
