import express from "express";
import {
  uploadNote,
  getNotes,
  getNoteById,
  deleteNote,
  searchNotes,
  incrementDownload,
  rateNote,
  addReview,
  getReviews,
  toggleBookmark,
  getBookmarks,
  generateFlashcards,
  downloadNote,
  getNoteFileUrl,
  getThumbnail,
  getNoteContent,
} from "../controllers/noteController";
import { protect } from "../middleware/authMiddleware";
import upload from "../config/multer";

const router = express.Router();

router.get("/", getNotes);
router.get("/search", searchNotes);
router.get("/bookmarks", protect, getBookmarks);
router.post("/:id/bookmark", protect, toggleBookmark);
router.get("/:id/download", protect, downloadNote);
router.get("/:id/file-url", protect, getNoteFileUrl);
router.get("/:id/thumbnail", protect, getThumbnail);
router.get("/:id/content", protect, getNoteContent);
router.get("/:id", getNoteById);
router.get("/:id/reviews", getReviews);
router.get("/:id/flashcards", protect, generateFlashcards);
router.post("/upload", protect, upload.single("file"), uploadNote);
router.post("/:id/rate", protect, rateNote);
router.post("/:id/review", protect, addReview);
router.patch("/:id/download", incrementDownload);
router.delete("/:id", protect, deleteNote);

export default router;
