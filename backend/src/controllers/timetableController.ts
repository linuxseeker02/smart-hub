import { Request, Response } from "express";
import Groq from "groq-sdk";
import Timetable from "../models/Timetable";
import { extractTimetableFile } from "../services/extractText";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

type Day = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
type SlotType = "lecture" | "lab" | "tutorial";

type TimetableSlotInput = {
  day: string;
  period: number;
  startTime: string;
  endTime: string;
  courseCode?: string;
  courseName: string;
  faculty?: string;
  room?: string;
  type?: string;
};

const DAYS: Day[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const SLOT_TYPES: SlotType[] = ["lecture", "lab", "tutorial"];

const normalizeSlot = (slot: TimetableSlotInput) => {
  const day = String(slot.day || "").toUpperCase() as Day;
  const typeRaw = String(slot.type || "lecture").toLowerCase();
  const type = SLOT_TYPES.includes(typeRaw as SlotType) ? (typeRaw as SlotType) : "lecture";
  const period = Number(slot.period);

  if (
    !DAYS.includes(day) ||
    !Number.isFinite(period) ||
    !String(slot.startTime || "").trim() ||
    !String(slot.endTime || "").trim() ||
    !String(slot.courseName || "").trim()
  ) {
    return null;
  }

  return {
    day,
    period,
    startTime: String(slot.startTime).trim(),
    endTime: String(slot.endTime).trim(),
    courseCode: String(slot.courseCode || "").trim(),
    courseName: String(slot.courseName).trim(),
    faculty: String(slot.faculty || "").trim(),
    room: String(slot.room || "").trim(),
    type,
  };
};

export const uploadTimetable = async (req: Request, res: Response): Promise<void> => {
  try {
    const { semester, academicSession, section, slots } = req.body as {
      semester?: number;
      academicSession?: string;
      section?: string;
      slots?: TimetableSlotInput[];
    };

    if (!Array.isArray(slots)) {
      res.status(400).json({ message: "slots are required" });
      return;
    }

    const normalizedSlots = slots
      .map((slot) => normalizeSlot(slot))
      .filter((slot): slot is NonNullable<ReturnType<typeof normalizeSlot>> => slot !== null);

    await Timetable.updateMany({ user: req.user.id, isActive: true }, { isActive: false });

    const timetable = await Timetable.create({
      user: req.user.id,
      ...(semester ? { semester: Number(semester) } : {}),
      academicSession: String(academicSession || "").trim(),
      section: String(section || "").trim(),
      slots: normalizedSlots,
      isActive: true,
      uploadedAt: new Date(),
    });

    res.status(201).json(timetable);
  } catch (error) {
    console.error("Upload timetable error:", error);
    res.status(500).json({ message: "Server error uploading timetable" });
  }
};

export const getTimetable = async (req: Request, res: Response): Promise<void> => {
  try {
    const timetable = await Timetable.findOne({ user: req.user.id, isActive: true }).sort({
      createdAt: -1,
    });

    if (!timetable) {
      res.status(200).json({ timetable: null });
      return;
    }

    res.status(200).json({ timetable });
  } catch (error) {
    console.error("Get timetable error:", error);
    res.status(500).json({ message: "Server error fetching timetable" });
  }
};

export const getTodayClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    const timetable = await Timetable.findOne({ user: req.user.id, isActive: true });
    const today = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][new Date().getDay()];

    if (!timetable) {
      res.status(200).json({ classes: [], day: today, total: 0 });
      return;
    }

    const classes = timetable.slots
      .filter((slot) => slot.day === today)
      .sort((a, b) => a.period - b.period);

    res.status(200).json({
      classes,
      day: today,
      total: classes.length,
    });
  } catch (error) {
    console.error("Get today classes error:", error);
    res.status(500).json({ message: "Server error fetching today's classes" });
  }
};

export const parseTimetableWithAI = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rawText } = req.body as { rawText?: string };

    if (!rawText || !rawText.trim()) {
      res.status(400).json({ message: "rawText is required" });
      return;
    }

    const slots = await parseTimetableText(rawText);
    res.status(200).json({ slots });
  } catch (error) {
    console.error("Parse timetable AI error:", error);
    res.status(500).json({ message: "Failed to parse timetable" });
  }
};

const parseTimetableText = async (rawText: string) => {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "You are a timetable parser. Respond ONLY with valid JSON array. No markdown.",
        },
        {
          role: "user",
          content: `Parse this university timetable text and return a JSON array of slot objects.
Each slot must have exactly these fields:
{ day: string (MON/TUE/WED/THU/FRI/SAT),
  period: number,
  startTime: string (HH:MM format),
  endTime: string (HH:MM format),
  courseCode: string,
  courseName: string,
  faculty: string,
  room: string,
  type: string (lecture/lab/tutorial) }

Timetable text:
${rawText}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("AI response was not a slot array");
    }

    return parsed
      .map((item) => normalizeSlot(item as TimetableSlotInput))
      .filter((slot): slot is NonNullable<ReturnType<typeof normalizeSlot>> => slot !== null);
};

export const uploadTimetableFile = async (req: Request, res: Response): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ status: "invalid", message: "A timetable file is required" });
    return;
  }

  const metadata = {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    url: file.path,
  };

  try {
    const extraction = await extractTimetableFile(file);
    if (extraction.status === "ocr_required") {
      res.status(422).json({ status: extraction.status, metadata, message: extraction.message, slots: [] });
      return;
    }

    if (!extraction.text || extraction.text.length < 20) {
      res.status(422).json({
        status: "insufficient_text",
        metadata,
        message: "No usable text could be extracted from this PDF. A text-based PDF is required.",
        slots: [],
      });
      return;
    }

    const slots = await parseTimetableText(extraction.text);
    res.status(200).json({
      status: slots.length ? "parsed" : "no_slots_found",
      metadata: { ...metadata, extractedCharacters: extraction.text.length },
      slots,
      saved: false,
    });
  } catch (error) {
    console.error("Timetable file processing error:", error);
    res.status(502).json({
      status: "parse_failed",
      metadata,
      message: "The timetable was uploaded, but AI parsing failed. Please use the JSON parse endpoint or try again.",
      slots: [],
      saved: false,
    });
  }
};

export const getTimetableHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const timetables = await Timetable.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ timetables });
  } catch (error) {
    console.error("Get timetable history error:", error);
    res.status(500).json({ message: "Server error fetching timetable history" });
  }
};
