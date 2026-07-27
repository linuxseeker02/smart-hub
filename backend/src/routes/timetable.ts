import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  getTimetable,
  getTodayClasses,
  parseTimetableWithAI,
  uploadTimetable,
} from "../controllers/timetableController";

const router = express.Router();

router.get("/", protect, getTimetable);
router.post("/", protect, uploadTimetable);
router.get("/today", protect, getTodayClasses);
router.post("/parse", protect, parseTimetableWithAI);

export default router;
