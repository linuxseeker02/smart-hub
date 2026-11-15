import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary";

const allowedMimeTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
const allowedExtensions = [".pdf", ".png", ".jpg", ".jpeg"];

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "smart-hub/timetables",
    resource_type: "auto",
    allowed_formats: ["pdf", "png", "jpg", "jpeg"],
    use_filename: true,
    unique_filename: true,
  } as any,
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();
  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(extension)) {
    cb(null, true);
    return;
  }

  cb(new Error("Only PDF, PNG, JPG, and JPEG timetable files are allowed"));
};

const timetableUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export default timetableUpload;
