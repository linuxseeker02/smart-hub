import mongoose, { Document, Schema } from "mongoose";

type Day = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
type SlotType = "lecture" | "lab" | "tutorial";

export interface ITimetableSlot {
  day: Day;
  period: number;
  startTime: string;
  endTime: string;
  courseCode: string;
  courseName: string;
  faculty: string;
  room: string;
  type: SlotType;
}

export interface ITimetable extends Document {
  user: mongoose.Types.ObjectId;
  semester: number;
  section: string;
  slots: ITimetableSlot[];
  isActive: boolean;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const timetableSlotSchema = new Schema<ITimetableSlot>(
  {
    day: {
      type: String,
      enum: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
      required: true,
    },
    period: { type: Number, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    courseCode: { type: String, default: "" },
    courseName: { type: String, required: true },
    faculty: { type: String, default: "" },
    room: { type: String, default: "" },
    type: {
      type: String,
      enum: ["lecture", "lab", "tutorial"],
      default: "lecture",
    },
  },
  { _id: true }
);

const timetableSchema = new Schema<ITimetable>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    semester: { type: Number, required: true },
    section: { type: String, default: "" },
    slots: {
      type: [timetableSlotSchema],
      default: [],
    },
    isActive: { type: Boolean, default: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const Timetable = mongoose.model<ITimetable>("Timetable", timetableSchema);

export default Timetable;
