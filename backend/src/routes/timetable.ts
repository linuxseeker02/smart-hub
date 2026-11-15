import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  getTimetable,
  getTodayClasses,
  parseTimetableWithAI,
  uploadTimetable,
  uploadTimetableFile,
  getTimetableHistory,
} from "../controllers/timetableController";
import timetableUpload from "../config/timetableMulter";

const router = express.Router();

router.get("/", protect, getTimetable);
router.post("/", protect, uploadTimetable);
router.get("/today", protect, getTodayClasses);
router.post("/parse", protect, parseTimetableWithAI);
router.get("/history", protect, getTimetableHistory);
router.post("/upload-file", protect, timetableUpload.single("file"), uploadTimetableFile);

export default router;
