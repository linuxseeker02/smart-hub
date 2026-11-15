import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  createExam,
  deleteExam,
  getExams,
  updateExam,
} from "../controllers/examController";

const router = express.Router();

router.get("/", protect, getExams);
router.post("/", protect, createExam);
router.put("/:id", protect, updateExam);
router.delete("/:id", protect, deleteExam);

export default router;
