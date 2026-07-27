import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  deleteSemester,
  getGrades,
  gradeToPoint,
  upsertSemester,
} from "../controllers/gradeController";

const router = express.Router();

router.get("/", protect, getGrades);
router.post("/semester", protect, upsertSemester);
router.delete("/semester/:id", protect, deleteSemester);
router.post("/convert", gradeToPoint);

export default router;
