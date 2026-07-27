import mongoose, { Document, Schema } from "mongoose";

export interface ICollection extends Document {
  name: string;
  description: string;
  owner: mongoose.Types.ObjectId;
  notes: mongoose.Types.ObjectId[];
  isPublic: boolean;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const collectionSchema = new Schema<ICollection>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Note",
      default: [],
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
      default: "#6366f1",
    },
  },
  {
    timestamps: true,
  }
);

const Collection = mongoose.model<ICollection>("Collection", collectionSchema);

export default Collection;
