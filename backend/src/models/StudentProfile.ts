import mongoose, { Document, Schema } from "mongoose";

export interface IStudentProfile extends Document {
  user: mongoose.Types.ObjectId;
  fullName: string;
  rollNumber: string;
  department: string;
  program: string;
  semester: number;
  section: string;
  batch: string;
  university: string;
  phone: string;
  photoUrl: string;
  studyStreak: number;
  lastStudyDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const studentProfileSchema = new Schema<IStudentProfile>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    fullName: { type: String, default: "" },
    rollNumber: { type: String, default: "" },
    department: { type: String, default: "" },
    program: { type: String, default: "" },
    semester: { type: Number, default: 1, min: 1, max: 8 },
    section: { type: String, default: "" },
    batch: { type: String, default: "" },
    university: { type: String, default: "" },
    phone: { type: String, default: "" },
    photoUrl: { type: String, default: "" },
    studyStreak: { type: Number, default: 0 },
    lastStudyDate: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

const StudentProfile = mongoose.model<IStudentProfile>("StudentProfile", studentProfileSchema);

export default StudentProfile;
