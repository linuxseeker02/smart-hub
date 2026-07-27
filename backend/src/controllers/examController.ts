import { Request, Response } from "express";
import Exam from "../models/Exam";

type ExamPayload = {
  courseCode?: string;
  courseName?: string;
  examDate?: string;
  examDay?: string;
  startTime?: string;
  endTime?: string;
  venue?: string;
  semester?: number;
  notes?: string;
  isCompleted?: boolean;
};

export const createExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as ExamPayload;

    if (!body.courseName || !body.examDate) {
      res.status(400).json({ message: "courseName and examDate are required" });
      return;
    }

    const parsedExamDate = new Date(body.examDate);
    if (Number.isNaN(parsedExamDate.getTime())) {
      res.status(400).json({ message: "examDate must be a valid date" });
      return;
    }

    const exam = await Exam.create({
      user: req.user.id,
      courseCode: String(body.courseCode || "").trim(),
      courseName: String(body.courseName).trim(),
      examDate: parsedExamDate,
      examDay: String(body.examDay || "").trim(),
      startTime: String(body.startTime || "").trim(),
      endTime: String(body.endTime || "").trim(),
      venue: String(body.venue || "").trim(),
      semester: Number(body.semester || 4),
      notes: String(body.notes || "").trim(),
    });

    res.status(201).json(exam);
  } catch (error) {
    console.error("Create exam error:", error);
    res.status(500).json({ message: "Server error creating exam" });
  }
};

export const getExams = async (req: Request, res: Response): Promise<void> => {
  try {
    const exams = await Exam.find({ user: req.user.id }).sort({ examDate: 1 });
    const now = new Date();
    const enriched = exams.map((exam) => {
      const examObj = exam.toObject();
      const examDate = new Date(examObj.examDate);
      const daysLeft = Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = examDate.getTime() < now.getTime() && !examObj.isCompleted;
      return {
        ...examObj,
        daysLeft,
        isOverdue,
      };
    });

    const upcoming = exams.filter(
      (exam) => !exam.isCompleted && new Date(exam.examDate).getTime() >= now.getTime()
    ).length;

    res.status(200).json({
      exams: enriched,
      upcoming,
    });
  } catch (error) {
    console.error("Get exams error:", error);
    res.status(500).json({ message: "Server error fetching exams" });
  }
};

export const updateExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      res.status(404).json({ message: "Exam not found" });
      return;
    }

    if (exam.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    const body = req.body as ExamPayload;

    if (body.courseCode !== undefined) exam.courseCode = String(body.courseCode).trim();
    if (body.courseName !== undefined) exam.courseName = String(body.courseName).trim();
    if (body.examDay !== undefined) exam.examDay = String(body.examDay).trim();
    if (body.startTime !== undefined) exam.startTime = String(body.startTime).trim();
    if (body.endTime !== undefined) exam.endTime = String(body.endTime).trim();
    if (body.venue !== undefined) exam.venue = String(body.venue).trim();
    if (body.semester !== undefined) exam.semester = Number(body.semester);
    if (body.notes !== undefined) exam.notes = String(body.notes).trim();
    if (body.isCompleted !== undefined) exam.isCompleted = Boolean(body.isCompleted);

    if (body.examDate !== undefined) {
      const parsedExamDate = new Date(body.examDate);
      if (Number.isNaN(parsedExamDate.getTime())) {
        res.status(400).json({ message: "examDate must be a valid date" });
        return;
      }
      exam.examDate = parsedExamDate;
    }

    await exam.save();
    res.status(200).json(exam);
  } catch (error) {
    console.error("Update exam error:", error);
    res.status(500).json({ message: "Server error updating exam" });
  }
};

export const deleteExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      res.status(404).json({ message: "Exam not found" });
      return;
    }

    if (exam.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    await Exam.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Exam deleted" });
  } catch (error) {
    console.error("Delete exam error:", error);
    res.status(500).json({ message: "Server error deleting exam" });
  }
};

export const seedSemester4Exams = async (req: Request, res: Response): Promise<void> => {
  try {
    const seedExams = [
      {
        courseCode: "BNC40105",
        courseName: "Windows Server Administration",
        examDate: new Date("2026-05-08"),
        examDay: "Friday",
        startTime: "10:30",
        endTime: "13:00",
        semester: 4,
      },
      {
        courseCode: "BNC40107",
        courseName: "Web Application Penetration Testing",
        examDate: new Date("2026-05-11"),
        examDay: "Monday",
        startTime: "10:30",
        endTime: "13:00",
        semester: 4,
      },
      {
        courseCode: "BNC40109",
        courseName: "Threat Modelling",
        examDate: new Date("2026-05-13"),
        examDay: "Wednesday",
        startTime: "10:30",
        endTime: "13:00",
        semester: 4,
      },
      {
        courseCode: "BNC40204",
        courseName: "Blockchain and Cryptocurrency",
        examDate: new Date("2026-05-15"),
        examDay: "Friday",
        startTime: "10:30",
        endTime: "13:00",
        semester: 4,
      },
    ];

    await Exam.deleteMany({ user: req.user.id });

    const exams = await Exam.insertMany(
      seedExams.map((exam) => ({
        ...exam,
        user: req.user.id,
      }))
    );

    res.status(201).json({
      exams,
      message: "Semester 4 exams loaded",
    });
  } catch (error) {
    console.error("Seed semester 4 exams error:", error);
    res.status(500).json({ message: "Server error seeding exams" });
  }
};
