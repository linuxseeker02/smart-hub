import { Request, Response } from "express";
import Note from "../models/Note";
import User from "../models/User";
import cloudinary from "../config/cloudinary";
import { extractTextFromUrl } from "../services/extractText";
import { processWithAI } from "../services/aiService";
import mongoose from "mongoose";
import Groq from "groq-sdk";
import https from "https";
import http from "http";
import { URL } from "url";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const uploadNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { semester, subject, topic } = req.body;

    if (!semester || !subject || !topic) {
      res.status(400).json({ message: "Semester, subject, and topic are required" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }

    let fileType: "pdf" | "docx" | "ppt";
    if (req.file.mimetype.includes("pdf")) {
      fileType = "pdf";
    } else if (req.file.mimetype.includes("msword") || req.file.mimetype.includes("officedocument")) {
      fileType = "docx";
    } else if (req.file.mimetype.includes("presentation")) {
      fileType = "ppt";
    } else {
      res.status(400).json({ message: "Invalid file type" });
      return;
    }

    const titleWithoutExt = req.file.originalname.replace(/\.[^/.]+$/, "");

    const note = await Note.create({
      uploadedBy: req.user.id,
      fileUrl: req.file.path,
      filePublicId: req.file.filename,
      originalName: req.file.originalname,
      fileType: fileType,
      semester: Number(semester),
      subject: subject.trim(),
      topic: topic.trim(),
      title: titleWithoutExt,
      aiProcessed: false,
    });

    await User.findByIdAndUpdate(req.user.id, {
      $push: { uploadedNotes: note._id },
    });

    res.status(201).json(note);

    // Process AI in background (fire and forget - don't block response)
    extractTextFromUrl(note.fileUrl, note.fileType)
      .then((extractedText) => processWithAI(extractedText, note.originalName))
      .then((aiResult) =>
        Note.findByIdAndUpdate(
          note._id,
          {
            title: aiResult.title,
            summary: aiResult.summary,
            keywords: aiResult.keywords,
            quizQuestions: aiResult.quizQuestions,
            aiProcessed: true,
          },
          { new: true }
        )
      )
      .then(() => {
        console.log(`AI processing completed for note: ${note._id}`);
      })
      .catch((err) => {
        console.error(`AI processing failed for note ${note._id}:`, err);
      });
  } catch (error) {
    console.error("Upload note error:", error);
    res.status(500).json({ message: "Server error during note upload" });
  }
};

export const getNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { semester, subject, topic, page = "1", limit = "10" } = req.query;

    const filter: any = {};

    if (semester) {
      filter.semester = Number(semester);
    }

    if (subject) {
      filter.subject = subject;
    }

    if (topic) {
      filter.topic = topic;
    }

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 50);

    const total = await Note.countDocuments(filter);
    const notes = await Note.find(filter)
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      notes,
      total,
      page: pageNum,
      totalPages,
    });
  } catch (error) {
    console.error("Get notes error:", error);
    res.status(500).json({ message: "Server error fetching notes" });
  }
};

export const getNoteById = async (req: Request, res: Response): Promise<void> => {
  try {
    const note = await Note.findById(req.params.id).populate("uploadedBy", "name email");

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    res.status(200).json(note);
  } catch (error) {
    console.error("Get note by id error:", error);
    res.status(500).json({ message: "Server error fetching note" });
  }
};

export const toggleBookmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const [user, note] = await Promise.all([
      User.findById(req.user.id),
      Note.findById(req.params.id).select("_id"),
    ]);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    const noteId = note._id.toString();
    const alreadyBookmarked = user.savedNotes.some(
      (savedNoteId) => savedNoteId.toString() === noteId
    );

    if (alreadyBookmarked) {
      user.savedNotes = user.savedNotes.filter(
        (savedNoteId) => savedNoteId.toString() !== noteId
      );
    } else {
      user.savedNotes.push(note._id as mongoose.Types.ObjectId);
    }

    await user.save();

    res.status(200).json({
      bookmarked: !alreadyBookmarked,
      savedCount: user.savedNotes.length,
    });
  } catch (error) {
    console.error("Toggle bookmark error:", error);
    res.status(500).json({ message: "Server error toggling bookmark" });
  }
};

export const getBookmarks = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: "savedNotes",
      populate: { path: "uploadedBy", select: "name email" },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({
      notes: user.savedNotes,
      total: user.savedNotes.length,
    });
  } catch (error) {
    console.error("Get bookmarks error:", error);
    res.status(500).json({ message: "Server error fetching bookmarks" });
  }
};

export const deleteNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    if (note.uploadedBy.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    await cloudinary.uploader.destroy(note.filePublicId, {
      resource_type: "raw",
    });

    await Note.findByIdAndDelete(req.params.id);

    await User.findByIdAndUpdate(req.user.id, {
      $pull: { uploadedNotes: note._id },
    });

    res.status(200).json({ message: "Note deleted" });
  } catch (error) {
    console.error("Delete note error:", error);
    res.status(500).json({ message: "Server error deleting note" });
  }
};

export const searchNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, semester, page = "1", limit = "10" } = req.query;

    if (!q || typeof q !== "string" || q.trim() === "") {
      res.status(400).json({ message: "Search query is required" });
      return;
    }

    const filter: any = {
      $text: { $search: q },
    };

    if (semester) {
      filter.semester = Number(semester);
    }

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 50);

    const total = await Note.countDocuments(filter);
    const notes = await Note.find(filter, { score: { $meta: "textScore" } })
      .populate("uploadedBy", "name email")
      .sort({ score: { $meta: "textScore" } })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      notes,
      total,
      page: pageNum,
      totalPages,
      query: q,
    });
  } catch (error) {
    console.error("Search notes error:", error);
    res.status(500).json({ message: "Server error searching notes" });
  }
};

export const incrementDownload = async (req: Request, res: Response): Promise<void> => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloadCount: 1 } },
      { new: true }
    );

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    res.status(200).json({ downloadCount: note.downloadCount });
  } catch (error) {
    console.error("Increment download error:", error);
    res.status(500).json({ message: "Server error incrementing download count" });
  }
};

export const rateNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stars } = req.body;

    if (typeof stars !== "number" || stars < 1 || stars > 5) {
      res.status(400).json({ message: "Stars must be a number between 1 and 5" });
      return;
    }

    const note = await Note.findById(req.params.id);

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    const existingRatingIndex = note.ratings.findIndex(
      (r) => r.userId.toString() === req.user.id
    );

    if (existingRatingIndex !== -1) {
      note.ratings[existingRatingIndex].stars = stars;
    } else {
      note.ratings.push({
        userId: req.user.id as unknown as mongoose.Types.ObjectId,
        stars,
      });
    }

    const total = note.ratings.reduce((sum, r) => sum + r.stars, 0);
    note.averageRating = Math.round((total / note.ratings.length) * 10) / 10;

    await note.save();

    res.status(200).json({
      averageRating: note.averageRating,
      totalRatings: note.ratings.length,
    });
  } catch (error) {
    console.error("Rate note error:", error);
    res.status(500).json({ message: "Server error rating note" });
  }
};

export const addReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== "string" || text.trim() === "") {
      res.status(400).json({ message: "Review text is required" });
      return;
    }

    if (text.length > 500) {
      res.status(400).json({ message: "Review text must not exceed 500 characters" });
      return;
    }

    const note = await Note.findById(req.params.id);

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    const alreadyReviewed = note.reviews.some(
      (r) => r.userId.toString() === req.user.id
    );

    if (alreadyReviewed) {
      res.status(400).json({ message: "You have already reviewed this note" });
      return;
    }

    const newReview = {
      userId: req.user.id as unknown as mongoose.Types.ObjectId,
      text: text.trim(),
      createdAt: new Date(),
    };

    note.reviews.push(newReview);
    await note.save();

    res.status(201).json(newReview);
  } catch (error) {
    console.error("Add review error:", error);
    res.status(500).json({ message: "Server error adding review" });
  }
};

export const getReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const note = await Note.findById(req.params.id).populate("reviews.userId", "name");

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    const sortedReviews = note.reviews.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    res.status(200).json({
      reviews: sortedReviews,
      total: note.reviews.length,
    });
  } catch (error) {
    console.error("Get reviews error:", error);
    res.status(500).json({ message: "Server error fetching reviews" });
  }
};

export const generateFlashcards = async (req: Request, res: Response): Promise<void> => {
  try {
    const noteId = req.params.id;
    const note = await Note.findById(noteId).select("title summary keywords");

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    if (!note.summary || note.summary === "No content extracted") {
      res.status(400).json({ message: "Note has no content for flashcard generation" });
      return;
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You are a flashcard generator. Respond ONLY with valid JSON. No markdown.",
        },
        {
          role: "user",
          content: `Generate 8 flashcards from this academic content.
Return a JSON array of objects with exactly these fields:
[{ front: string, back: string }]
Front: a question or concept
Back: the answer or explanation (max 2 sentences)

Content:
Title: ${note.title}
Summary: ${note.summary}
Keywords: ${note.keywords.join(", ")}`,
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "[]";
    const cleanedContent = rawContent.replace(/```json|```/g, "").trim();

    let parsedFlashcards: unknown;
    try {
      parsedFlashcards = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Flashcards parse error:", parseError);
      res.status(500).json({ message: "Failed to generate flashcards" });
      return;
    }

    if (!Array.isArray(parsedFlashcards)) {
      res.status(500).json({ message: "Failed to generate flashcards" });
      return;
    }

    const flashcards = parsedFlashcards
      .filter(
        (card): card is { front: string; back: string } =>
          typeof card === "object" &&
          card !== null &&
          "front" in card &&
          "back" in card &&
          typeof (card as { front: unknown }).front === "string" &&
          typeof (card as { back: unknown }).back === "string"
      )
      .map((card) => ({
        front: card.front.trim(),
        back: card.back.trim(),
      }));

    res.status(200).json({ flashcards });
  } catch (error) {
    console.error("Generate flashcards error:", error);
    res.status(500).json({ message: "Failed to generate flashcards" });
  }
};

export const downloadNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const note = await Note.findById(id);

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    // Determine Content-Type based on fileType
    const contentTypeMap: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ppt: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };

    const contentType = contentTypeMap[note.fileType] || "application/octet-stream";

    // Set response headers
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(note.originalName)}"`
    );

    // Parse URL and choose appropriate module
    const parsedUrl = new URL(note.fileUrl);
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    // Fetch file from URL and pipe to response
    protocol.get(note.fileUrl, (fileRes) => {
      fileRes.pipe(res);

      fileRes.on("error", (err) => {
        console.error("Error streaming file:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Error downloading file" });
        }
      });
    }).on("error", (err) => {
      console.error("Error fetching file:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Error downloading file" });
      }
    });

    // Increment download count atomically
    await Note.findByIdAndUpdate(id, { $inc: { downloadCount: 1 } });
  } catch (error) {
    console.error("Download note error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error downloading note" });
    }
  }
};

export const getThumbnail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const note = await Note.findById(id).select("fileUrl fileType filePublicId");

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    if (note.fileType !== "pdf") {
      res.status(404).json({ message: "Thumbnail only available for PDF files" });
      return;
    }

    // Construct Cloudinary thumbnail URL
    const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const thumbnailUrl = `https://res.cloudinary.com/${cloudinaryCloudName}/image/upload/w_400,h_300,c_fill,pg_1,f_jpg/${note.filePublicId}.jpg`;

    res.redirect(thumbnailUrl);
  } catch (error) {
    console.error("Get thumbnail error:", error);
    res.status(500).json({ message: "Server error fetching thumbnail" });
  }
};
