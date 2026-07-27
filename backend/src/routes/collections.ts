import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  createCollection,
  getMyCollections,
  addNoteToCollection,
  removeNoteFromCollection,
  deleteCollection,
} from "../controllers/collectionController";

const router = express.Router();

router.post("/", protect, createCollection);
router.get("/", protect, getMyCollections);
router.post("/:collectionId/notes/:noteId", protect, addNoteToCollection);
router.delete("/:collectionId/notes/:noteId", protect, removeNoteFromCollection);
router.delete("/:collectionId", protect, deleteCollection);

export default router;
