import { Request, Response } from "express";
import Collection from "../models/Collection";
import Note from "../models/Note";

export const createCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, isPublic, color } = req.body as {
      name?: string;
      description?: string;
      isPublic?: boolean;
      color?: string;
    };

    if (!name || !name.trim()) {
      res.status(400).json({ message: "Collection name is required" });
      return;
    }

    const collection = await Collection.create({
      name: name.trim(),
      description: (description || "").trim(),
      owner: req.user.id,
      isPublic: Boolean(isPublic),
      color: color || "#6366f1",
    });

    res.status(201).json(collection);
  } catch (error) {
    console.error("Create collection error:", error);
    res.status(500).json({ message: "Server error creating collection" });
  }
};

export const getMyCollections = async (req: Request, res: Response): Promise<void> => {
  try {
    const collections = await Collection.find({ owner: req.user.id })
      .populate("notes", "title subject fileType averageRating")
      .sort({ createdAt: -1 });

    res.status(200).json({
      collections,
      total: collections.length,
    });
  } catch (error) {
    console.error("Get collections error:", error);
    res.status(500).json({ message: "Server error fetching collections" });
  }
};

export const addNoteToCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { collectionId, noteId } = req.params;

    const [collection, note] = await Promise.all([
      Collection.findById(collectionId),
      Note.findById(noteId).select("_id"),
    ]);

    if (!collection) {
      res.status(404).json({ message: "Collection not found" });
      return;
    }

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    if (collection.owner.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    const alreadyExists = collection.notes.some((id) => id.toString() === noteId);
    if (alreadyExists) {
      res.status(400).json({ message: "Note already in collection" });
      return;
    }

    collection.notes.push(note._id);
    await collection.save();

    res.status(200).json({ message: "Note added to collection" });
  } catch (error) {
    console.error("Add note to collection error:", error);
    res.status(500).json({ message: "Server error updating collection" });
  }
};

export const removeNoteFromCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { collectionId, noteId } = req.params;

    const collection = await Collection.findById(collectionId);
    if (!collection) {
      res.status(404).json({ message: "Collection not found" });
      return;
    }

    if (collection.owner.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    collection.notes = collection.notes.filter((id) => id.toString() !== noteId);
    await collection.save();

    res.status(200).json({ message: "Note removed from collection" });
  } catch (error) {
    console.error("Remove note from collection error:", error);
    res.status(500).json({ message: "Server error updating collection" });
  }
};

export const deleteCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { collectionId } = req.params;

    const collection = await Collection.findById(collectionId);
    if (!collection) {
      res.status(404).json({ message: "Collection not found" });
      return;
    }

    if (collection.owner.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    await Collection.findByIdAndDelete(collectionId);
    res.status(200).json({ message: "Collection deleted" });
  } catch (error) {
    console.error("Delete collection error:", error);
    res.status(500).json({ message: "Server error deleting collection" });
  }
};
