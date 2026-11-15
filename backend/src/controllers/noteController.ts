import { Request, Response } from "express";
import Note from "../models/Note";
import User from "../models/User";
import cloudinary from "../config/cloudinary";
import { extractTextFromUrl } from "../services/extractText";
import { processWithAI } from "../services/aiService";
import mongoose from "mongoose";
import Groq from "groq-sdk";
import { publicNoteFilter } from "../utils/resourceVisibility";
import {
  createAuthenticatedThumbnailUrl,
  createSignedResourceFileUrl,
  removeProviderFileFields,
  ResourceDeliveryError,
  RESOURCE_FILE_URL_EXPIRY_SECONDS,
  removePrivateNoteFields,
} from "../utils/resourceFileAccess";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface Flashcard {
  front: string;
  back: string;
}

interface FlashcardResponse {
  flashcards: Flashcard[];
}

const MAX_AI_RESPONSE_PREVIEW_LENGTH = 400;

const toSingleLinePreview = (value: string): string =>
  value.replace(/\s+/g, " ").trim().slice(0, MAX_AI_RESPONSE_PREVIEW_LENGTH);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const cleanupUploadedNote = async (file: Express.Multer.File | undefined): Promise<void> => {
  if (!file?.filename) return;

  try {
    await cloudinary.uploader.destroy(file.filename, { resource_type: "raw" });
  } catch (error) {
    console.error("Note upload cleanup failed:", {
      error: error instanceof Error ? error.message : "Unknown cleanup error",
    });
  }
};

const parseAndValidateFlashcards = (rawContent: string): FlashcardResponse => {
  const parsed = JSON.parse(rawContent) as unknown;

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Flashcard response must be a JSON object");
  }

  const flashcards = (parsed as { flashcards?: unknown }).flashcards;

  if (!Array.isArray(flashcards)) {
    throw new Error("flashcards must be an array");
  }

  if (flashcards.length !== 8) {
    throw new Error("flashcards array must contain exactly 8 items");
  }

  const normalizedFlashcards = flashcards.map((card, index) => {
    if (typeof card !== "object" || card === null) {
      throw new Error(`flashcards[${index}] must be an object`);
    }

    const front = (card as { front?: unknown }).front;
    const back = (card as { back?: unknown }).back;

    if (!isNonEmptyString(front)) {
      throw new Error(`flashcards[${index}].front must be a non-empty string`);
    }

    if (!isNonEmptyString(back)) {
      throw new Error(`flashcards[${index}].back must be a non-empty string`);
    }

    return {
      front: front.trim(),
      back: back.trim(),
    };
  });

  return { flashcards: normalizedFlashcards };
};

export const uploadNote = async (req: Request, res: Response): Promise<void> => {
  let createdNoteId: mongoose.Types.ObjectId | null = null;
  try {
    const { semester, subject, topic } = req.body;

    const semesterNumber = Number(semester);
    if (
      !Number.isInteger(semesterNumber) ||
      semesterNumber < 1 ||
      semesterNumber > 8 ||
      !isNonEmptyString(subject) ||
      !isNonEmptyString(topic)
    ) {
      await cleanupUploadedNote(req.file);
      res.status(400).json({ message: "Semester, subject, and topic are required" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }

    // MIME validation is handled by multer fileFilter upstream.
    const fileType: "pdf" | "docx" | "ppt" = req.file.mimetype.includes("pdf")
      ? "pdf"
      : req.file.mimetype.includes("presentation")
        ? "ppt"
        : "docx";

    const titleWithoutExt = req.file.originalname.replace(/\.[^/.]+$/, "");

    const note = await Note.create({
      uploadedBy: req.user.id,
      fileUrl: req.file.path,
      filePublicId: req.file.filename,
      deliveryMode: "authenticated",
      deliveryResourceType: fileType === "pdf" ? "image" : "raw",
      originalName: req.file.originalname,
      fileType: fileType,
      semester: semesterNumber,
      subject: subject.trim(),
      topic: topic.trim(),
      title: titleWithoutExt,
      aiProcessed: false,
      moderationStatus: "pending",
    });
    createdNoteId = note._id;

    await User.findByIdAndUpdate(req.user.id, {
      $push: { uploadedNotes: note._id },
    });

    res.status(201).json(
      removeProviderFileFields(note)
    );

    // Process AI in background (fire and forget - don't block response)
    extractTextFromUrl(
      createSignedResourceFileUrl(
        note.filePublicId,
        note.fileType,
        note.deliveryMode,
        note.deliveryResourceType
      ),
      note.fileType
    )
      .then((extractedText) => processWithAI(extractedText, note.originalName))
      .then((aiResult) => {
        if (!aiResult) {
          console.error(`AI processing failed for note ${note._id}`, {
            stage: "validation",
            error: "AI result was null",
          });
          return null;
        }

        return Note.findByIdAndUpdate(
          note._id,
          {
            title: aiResult.title,
            summary: aiResult.summary,
            keywords: aiResult.keywords,
            quizQuestions: aiResult.quizQuestions,
            aiProcessed: true,
          },
          { new: true }
        ).then((updatedNote) => {
          if (!updatedNote) {
            throw new Error("Note not found during AI database update");
          }
          return updatedNote;
        });
      })
      .then((updatedNote) => {
        if (updatedNote) {
          console.log(`AI processing completed for note: ${note._id}`);
        }
      })
      .catch((err: unknown) => {
        console.error(`AI processing failed for note ${note._id}`, {
          stage: "background_pipeline",
          error: err instanceof Error ? err.message : "Unknown background AI error",
        });
      });
  } catch (error) {
    if (createdNoteId) {
      try {
        await Note.findByIdAndDelete(createdNoteId);
      } catch (rollbackError) {
        console.error("Note upload database rollback failed:", {
          error:
            rollbackError instanceof Error
              ? rollbackError.message
              : "Unknown rollback error",
        });
      }

      try {
        await User.findByIdAndUpdate(req.user.id, {
          $pull: { uploadedNotes: createdNoteId },
        });
      } catch (reconciliationError) {
        console.error("Note upload user-reference reconciliation failed:", {
          error:
            reconciliationError instanceof Error
              ? reconciliationError.message
              : "Unknown reconciliation error",
        });
      }
    }
    await cleanupUploadedNote(req.file);
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

    const publicFilter = publicNoteFilter(filter);
    const total = await Note.countDocuments(publicFilter);
    const notes = await Note.find(publicFilter)
      .populate("uploadedBy", "name")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      notes: notes.map((note) =>
        removePrivateNoteFields(note)
      ),
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
    const note = await Note.findOne(
      publicNoteFilter({ _id: req.params.id })
    ).populate("uploadedBy", "name");

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    res.status(200).json(removePrivateNoteFields(note));
  } catch (error) {
    console.error("Get note by id error:", error);
    res.status(500).json({ message: "Server error fetching note" });
  }
};

export const toggleBookmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const [user, note] = await Promise.all([
      User.findById(req.user.id),
      Note.findOne(publicNoteFilter({ _id: req.params.id })).select("_id"),
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
      match: publicNoteFilter(),
      populate: { path: "uploadedBy", select: "name email" },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({
      notes: user.savedNotes.map((note) =>
        removeProviderFileFields(note)
      ),
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

    const filter: any = publicNoteFilter({
      $text: { $search: q },
    });

    if (semester) {
      filter.semester = Number(semester);
    }

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 50);

    const total = await Note.countDocuments(filter);
    const notes = await Note.find(filter, { score: { $meta: "textScore" } })
      .populate("uploadedBy", "name")
      .sort({ score: { $meta: "textScore" } })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      notes: notes.map((note) =>
        removePrivateNoteFields(note)
      ),
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
    const note = await Note.findOneAndUpdate(
      publicNoteFilter({ _id: req.params.id }),
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
    const stars = Number(req.body.stars);

    if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
      res.status(400).json({ message: "Stars must be a number between 1 and 5" });
      return;
    }

    const note = await Note.findOne(publicNoteFilter({ _id: req.params.id }));

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

    const note = await Note.findOne(publicNoteFilter({ _id: req.params.id }));

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
    const note = await Note.findOne(
      publicNoteFilter({ _id: req.params.id })
    ).populate("reviews.userId", "name");

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
    const note = await Note.findOne(
      publicNoteFilter({ _id: noteId })
    ).select("title summary keywords");

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    if (!note.summary || note.summary === "No content extracted") {
      res.status(400).json({ message: "Note has no content for flashcard generation" });
      return;
    }

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an academic flashcard generator. Use only the supplied title, summary, and keywords. Do not invent facts. Return only one valid JSON object. No markdown and no extra text.",
        },
        {
          role: "user",
          content: `Generate exactly 8 flashcards from this academic content.
Return exactly one JSON object with this structure:
{
  "flashcards": [
    {
      "front": "Question or concept",
      "back": "Answer or explanation"
    }
  ]
}

Rules:
- flashcards must have exactly 8 items.
- every item must have non-empty strings for front and back.
- front should be a meaningful question or concept prompt.
- back should be concise, approximately two sentences maximum.
- avoid duplicates.
- use only the provided content, with no fabricated facts.

Content:
Title: ${note.title}
Summary: ${note.summary}
Keywords: ${note.keywords.join(", ")}`,
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";
    const cleanedContent = rawContent.trim();

    let flashcardResponse: FlashcardResponse;
    try {
      flashcardResponse = parseAndValidateFlashcards(cleanedContent);
    } catch (parseError) {
      console.error("Flashcard generation failed", {
        stage: "parsing_or_validation",
        error: parseError instanceof Error ? parseError.message : "Unknown flashcard parse error",
        responsePreview: toSingleLinePreview(cleanedContent),
      });
      res.status(500).json({ message: "Failed to generate flashcards" });
      return;
    }

    res.status(200).json(flashcardResponse);
  } catch (error) {
    console.error("Generate flashcards error:", error);
    res.status(500).json({ message: "Failed to generate flashcards" });
  }
};

export const getNoteContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const note = await Note.findOne(publicNoteFilter({ _id: req.params.id })).select(
      "title summary keywords quizQuestions fileType originalName aiProcessed"
    );

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    res.status(200).json(note);
  } catch (error) {
    console.error("Get note content error:", error);
    res.status(500).json({ message: "Server error fetching note content" });
  }
};

export const downloadNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const note = await Note.findOne(publicNoteFilter({ _id: id }));

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    const signedUrl = createSignedResourceFileUrl(
      note.filePublicId,
      note.fileType,
      note.deliveryMode,
      note.deliveryResourceType,
      undefined,
      true
    );

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

    res.redirect(signedUrl);

    // Increment download count atomically
    await Note.findOneAndUpdate(
      publicNoteFilter({ _id: id }),
      { $inc: { downloadCount: 1 } }
    );
  } catch (error) {
    console.error("Download note error:", error);
    if (error instanceof ResourceDeliveryError) {
      res.status(409).json({ message: error.message, code: error.code });
      return;
    }
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error downloading note" });
    }
  }
};

export const getNoteFileUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const note = await Note.findOne(
      publicNoteFilter({ _id: req.params.id })
    ).select("filePublicId fileType deliveryMode deliveryResourceType");

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    res.status(200).json({
      url: createSignedResourceFileUrl(
        note.filePublicId,
        note.fileType,
        note.deliveryMode,
        note.deliveryResourceType
      ),
      expiresIn: RESOURCE_FILE_URL_EXPIRY_SECONDS,
    });
  } catch (error) {
    console.error("Get note file URL error:", error);
    if (error instanceof ResourceDeliveryError) {
      res.status(409).json({ message: error.message, code: error.code });
      return;
    }
    res.status(500).json({ message: "Server error creating file URL" });
  }
};

export const getThumbnail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const note = await Note.findOne(
      publicNoteFilter({ _id: id })
    ).select("fileType filePublicId deliveryMode deliveryResourceType");

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    if (note.fileType !== "pdf") {
      res.status(404).json({ message: "Thumbnail only available for PDF files" });
      return;
    }

    const thumbnailUrl = createAuthenticatedThumbnailUrl(
      note.filePublicId,
      note.deliveryMode,
      note.deliveryResourceType
    );
    const thumbnailResponse = await fetch(thumbnailUrl);
    if (!thumbnailResponse.ok) {
      res.status(404).json({ message: "Thumbnail unavailable" });
      return;
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).send(Buffer.from(await thumbnailResponse.arrayBuffer()));
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceDeliveryError") {
      res.status(404).json({ message: "Thumbnail unavailable" });
      return;
    }
    console.error("Get thumbnail error:", error);
    res.status(500).json({ message: "Server error fetching thumbnail" });
  }
};
