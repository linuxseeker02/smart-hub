import mongoose, { Document, Schema } from "mongoose";

interface IAttendanceRecord {
  date: Date;
  status: "present" | "absent" | "late";
  note: string;
}

export interface IAttendance extends Document {
  user: mongoose.Types.ObjectId;
  subject: string;
  totalClasses: number;
  attendedClasses: number;
  minimumRequired: number;
  records: IAttendanceRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    totalClasses: {
      type: Number,
      default: 0,
      min: 0,
    },
    attendedClasses: {
      type: Number,
      default: 0,
      min: 0,
    },
    minimumRequired: {
      type: Number,
      default: 75,
      min: 0,
      max: 100,
    },
    records: {
      type: [
        {
          date: { type: Date, required: true },
          status: {
            type: String,
            enum: ["present", "absent", "late"],
            required: true,
          },
          note: { type: String, default: "" },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Attendance = mongoose.model<IAttendance>("Attendance", attendanceSchema);

export default Attendance;
