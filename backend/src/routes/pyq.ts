import { Router } from "express";
import { protect } from "../middleware/authMiddleware";
import upload from "../config/multer";
import {
  deletePYQ,
  downloadPYQ,
  getPYQFileUrl,
  getPYQs,
  uploadPYQ,
} from "../controllers/pyqController";

const router = Router();

router.post("/upload", protect, upload.single("file"), uploadPYQ);
router.get("/", getPYQs);
router.get("/:id/download", protect, downloadPYQ);
router.get("/:id/file-url", protect, getPYQFileUrl);
router.delete("/:id", protect, deletePYQ);

export default router;
