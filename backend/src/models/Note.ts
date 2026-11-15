import mongoose, { Document, Schema } from "mongoose";

interface IQuizQuestion {
  question: string;
  options: string[];
  answer: string;
}

interface IRating {
  userId: mongoose.Types.ObjectId;
  stars: number;
}

interface IReview {
  userId: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
}

export type ModerationStatus = "pending" | "approved" | "rejected" | "removed";
export type ResourceDeliveryMode = "authenticated" | "legacy-public";
export type ResourceDeliveryType = "image" | "raw";

export interface IModerationHistoryEntry {
  status: ModerationStatus;
  moderatedBy: mongoose.Types.ObjectId;
  moderatedAt: Date;
  reason?: string;
}

export interface INote extends Document {
  uploadedBy: mongoose.Types.ObjectId;
  fileUrl: string;
  filePublicId: string;
  deliveryMode?: ResourceDeliveryMode;
  deliveryResourceType?: ResourceDeliveryType;
  fileType: "pdf" | "docx" | "ppt";
  originalName: string;
  title: string;
  summary: string;
  keywords: string[];
  quizQuestions: IQuizQuestion[];
  semester: number;
  subject: string;
  topic: string;
  ratings: IRating[];
  averageRating: number;
  reviews: IReview[];
  downloadCount: number;
  aiProcessed: boolean;
  moderationStatus?: ModerationStatus;
  moderatedBy?: mongoose.Types.ObjectId;
  moderatedAt?: Date;
  moderationReason?: string;
  moderationHistory: IModerationHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new Schema<INote>(
  {
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    filePublicId: {
      type: String,
      required: true,
    },
    deliveryMode: {
      type: String,
      enum: ["authenticated", "legacy-public"],
    },
    deliveryResourceType: {
      type: String,
      enum: ["image", "raw"],
    },
    fileType: {
      type: String,
      enum: ["pdf", "docx", "ppt"],
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: "",
    },
    summary: {
      type: String,
      default: "",
    },
    keywords: {
      type: [String],
      default: [],
    },
    quizQuestions: {
      type: [
        {
          question: String,
          options: [String],
          answer: String,
        },
      ],
      default: [],
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    ratings: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          stars: { type: Number, min: 1, max: 5 },
        },
      ],
      default: [],
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    reviews: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          text: { type: String },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    aiProcessed: {
      type: Boolean,
      default: false,
    },
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "removed"],
      default: "pending",
      index: true,
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    moderatedAt: Date,
    moderationReason: {
      type: String,
      maxlength: 500,
    },
    moderationHistory: {
      type: [
        {
          status: {
            type: String,
            enum: ["pending", "approved", "rejected", "removed"],
            required: true,
          },
          moderatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          moderatedAt: { type: Date, required: true },
          reason: { type: String, maxlength: 500 },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

noteSchema.index({
  title: "text",
  summary: "text",
  keywords: "text",
  subject: "text",
  topic: "text",
});
noteSchema.index({ moderationStatus: 1, createdAt: -1 });

const Note = mongoose.model<INote>("Note", noteSchema);

export default Note;
