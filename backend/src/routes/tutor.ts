import express from "express";
import { chat } from "../controllers/tutorController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

router.post("/", protect, chat);
router.post("/chat", protect, chat);

export default router;
