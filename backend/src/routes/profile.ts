import express from "express";
import { protect } from "../middleware/authMiddleware";
import { getProfile, upsertProfile } from "../controllers/profileController";

const router = express.Router();

router.get("/", protect, getProfile);
router.put("/", protect, upsertProfile);

export default router;
