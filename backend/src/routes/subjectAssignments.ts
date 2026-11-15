import { Router } from "express";
import { protect } from "../middleware/authMiddleware";
import {
  getSubjectAssignments,
  updateAssignment,
  updateClassTest,
  updateOtherMarks,
} from "../controllers/subjectAssignmentController";

const router = Router();

router.use(protect);
router.get("/", getSubjectAssignments);
router.put("/:subjectId/assignments/:number", updateAssignment);
router.put("/:subjectId/classtests/:testNumber/sets/:setNumber", updateClassTest);
router.put("/:subjectId/other", updateOtherMarks);

export default router;
