import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  createExam,
  deleteExam,
  getExams,
  seedSemester4Exams,
  updateExam,
} from "../controllers/examController";

const router = express.Router();

router.get("/", protect, getExams);
router.post("/", protect, createExam);
router.post("/seed", protect, seedSemester4Exams);
router.put("/:id", protect, updateExam);
router.delete("/:id", protect, deleteExam);

export default router;
