import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const getMongoUri = (): string => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("Missing MongoDB connection string. Set MONGO_URI or MONGODB_URI in backend/.env.");
  }

  return uri;
};

export const connectDB = async (): Promise<void> => {
  const uri = getMongoUri();

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 30000,
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("MongoDB connection failed. Check Atlas network access / whitelist, credentials, and the MONGO_URI or MONGODB_URI value.");
    console.error(message);

    throw error;
  }
};
