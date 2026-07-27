import mongoose, { Document, Schema } from "mongoose";

export interface IExam extends Document {
  user: mongoose.Types.ObjectId;
  courseCode: string;
  courseName: string;
  examDate: Date;
  examDay: string;
  startTime: string;
  endTime: string;
  venue: string;
  semester: number;
  notes: string;
  isCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const examSchema = new Schema<IExam>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    courseCode: { type: String, default: "" },
    courseName: { type: String, required: true },
    examDate: { type: Date, required: true },
    examDay: { type: String, default: "" },
    startTime: { type: String, default: "" },
    endTime: { type: String, default: "" },
    venue: { type: String, default: "" },
    semester: { type: Number, default: 4 },
    notes: { type: String, default: "" },
    isCompleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

const Exam = mongoose.model<IExam>("Exam", examSchema);

export default Exam;
