import mongoose, { Document, Schema } from "mongoose";

export type AssignmentStatus = "pending" | "submitted" | "graded";

export interface ISubjectAssignmentEntry {
  _id?: mongoose.Types.ObjectId;
  number: number;
  title: string;
  description: string;
  submittedDate: Date | null;
  marksObtained: number | null;
  maxMarks: number;
  status: AssignmentStatus;
  feedback: string;
}

export interface IClassTestEntry {
  _id?: mongoose.Types.ObjectId;
  number: number;
  set: number;
  marksObtained: number | null;
  maxMarks: number;
  conductedDate: Date | null;
  remarks: string;
}

export interface ISubjectAssignment extends Document {
  user: mongoose.Types.ObjectId;
  semester: number;
  courseCode: string;
  courseName: string;
  assignments: ISubjectAssignmentEntry[];
  classTests: IClassTestEntry[];
  otherMarks: number;
  totalCIAMarks: number;
  maxCIAMarks: number;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentEntrySchema = new Schema<ISubjectAssignmentEntry>(
  {
    number: { type: Number, required: true },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    submittedDate: { type: Date, default: null },
    marksObtained: { type: Number, default: null, min: 0, max: 5 },
    maxMarks: { type: Number, default: 5 },
    status: { type: String, enum: ["pending", "submitted", "graded"], default: "pending" },
    feedback: { type: String, default: "" },
  },
  { _id: true }
);

const classTestEntrySchema = new Schema<IClassTestEntry>(
  {
    number: { type: Number, required: true },
    set: { type: Number, required: true },
    marksObtained: { type: Number, default: null, min: 0, max: 20 },
    maxMarks: { type: Number, default: 20 },
    conductedDate: { type: Date, default: null },
    remarks: { type: String, default: "" },
  },
  { _id: true }
);

const subjectAssignmentSchema = new Schema<ISubjectAssignment>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    semester: { type: Number, required: true },
    courseCode: { type: String, required: true },
    courseName: { type: String, required: true },
    assignments: { type: [assignmentEntrySchema], default: [] },
    classTests: { type: [classTestEntrySchema], default: [] },
    otherMarks: { type: Number, default: 0, min: 0, max: 10 },
    totalCIAMarks: { type: Number, default: 0 },
    maxCIAMarks: { type: Number, default: 60 },
  },
  {
    timestamps: true,
  }
);

const SubjectAssignment = mongoose.model<ISubjectAssignment>(
  "SubjectAssignment",
  subjectAssignmentSchema
);

export default SubjectAssignment;
