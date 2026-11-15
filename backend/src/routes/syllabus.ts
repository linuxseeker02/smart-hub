import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  deleteSubject,
  generateSyllabus,
  getSyllabus,
  updateTopicStatus,
} from "../controllers/syllabusController";

const router = express.Router();

router.get("/", protect, getSyllabus);
router.post("/generate", protect, generateSyllabus);
router.put("/:subjectId/topics/:topicId", protect, updateTopicStatus);
router.delete("/:subjectId", protect, deleteSubject);

export default router;
