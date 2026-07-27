import express from "express";
import { protect } from "../middleware/authMiddleware";
import { getSessionStats, logSession } from "../controllers/studySessionController";

const router = express.Router();

router.post("/log", protect, logSession);
router.get("/stats", protect, getSessionStats);

export default router;
