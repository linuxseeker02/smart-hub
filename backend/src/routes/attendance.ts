import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  addSubject,
  getAttendance,
  markAttendance,
  updateSubject,
  deleteSubject,
} from "../controllers/attendanceController";

const router = express.Router();

router.get("/", protect, getAttendance);
router.post("/", protect, addSubject);
router.post("/:subjectId/mark", protect, markAttendance);
router.put("/:subjectId", protect, updateSubject);
router.delete("/:subjectId", protect, deleteSubject);

export default router;
