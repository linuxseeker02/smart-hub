import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  deleteSubject,
  generateSyllabus,
  getSyllabus,
  seedSemester4Syllabus,
  updateTopicStatus,
} from "../controllers/syllabusController";

const router = express.Router();

router.get("/", protect, getSyllabus);
router.post("/generate", protect, generateSyllabus);
router.post("/seed", protect, seedSemester4Syllabus);
router.put("/:subjectId/topics/:topicId", protect, updateTopicStatus);
router.delete("/:subjectId", protect, deleteSubject);

export default router;
