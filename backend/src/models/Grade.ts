import mongoose, { Document, Schema } from "mongoose";

interface IGradeSubject {
  name: string;
  credits: number;
  grade: string;
  gradePoint: number;
  marks: number | null;
  maxMarks: number;
}

export interface IGrade extends Document {
  user: mongoose.Types.ObjectId;
  semester: number;
  subjects: IGradeSubject[];
  sgpa: number;
  totalCredits: number;
  createdAt: Date;
  updatedAt: Date;
}

const gradeSchema = new Schema<IGrade>(
  {
    user: {
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
    subjects: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          credits: { type: Number, required: true, min: 0 },
          grade: { type: String, required: true },
          gradePoint: { type: Number, required: true, min: 0, max: 10 },
          marks: { type: Number, default: null },
          maxMarks: { type: Number, default: 100 },
        },
      ],
      default: [],
    },
    sgpa: {
      type: Number,
      default: 0,
    },
    totalCredits: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

gradeSchema.index({ user: 1, semester: 1 }, { unique: true });

const Grade = mongoose.model<IGrade>("Grade", gradeSchema);

export default Grade;
