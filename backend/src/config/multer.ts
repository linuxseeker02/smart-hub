import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary";

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "smart-hub/notes",
    resource_type: "raw",
    allowed_formats: ["pdf", "docx", "ppt", "pptx"],
    use_filename: true,
    unique_filename: true,
  } as any,
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = ["pdf", "msword", "officedocument", "presentation"];
  const isAllowed = allowedMimeTypes.some((type) => file.mimetype.includes(type));

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, DOCX, and PPT files are allowed"));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export default upload;
