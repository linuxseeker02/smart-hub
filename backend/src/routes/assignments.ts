import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  createAssignment,
  getAssignments,
  getUpcoming,
  updateAssignment,
  deleteAssignment,
} from "../controllers/assignmentController";

const router = express.Router();

router.get("/", protect, getAssignments);
router.post("/", protect, createAssignment);
router.get("/upcoming", protect, getUpcoming);
router.put("/:id", protect, updateAssignment);
router.delete("/:id", protect, deleteAssignment);

export default router;
