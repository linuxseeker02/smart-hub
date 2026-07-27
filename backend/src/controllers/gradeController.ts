import { Request, Response } from "express";
import Grade from "../models/Grade";

type InputSubject = {
  name: string;
  credits: number;
  grade: string;
  gradePoint: number;
  marks?: number | null;
  maxMarks?: number;
};

const parseNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const calculateSGPA = (subjects: InputSubject[]): number => {
  if (!subjects || subjects.length === 0) return 0;

  const totalCredits = subjects.reduce((sum, subject) => sum + parseNumber(subject.credits), 0);
  if (totalCredits === 0) return 0;

  const weightedPoints = subjects.reduce(
    (sum, subject) => sum + parseNumber(subject.gradePoint) * parseNumber(subject.credits),
    0
  );

  return Number((weightedPoints / totalCredits).toFixed(2));
};

export const upsertSemester = async (req: Request, res: Response): Promise<void> => {
  try {
    const { semester, subjects } = req.body as {
      semester?: number;
      subjects?: InputSubject[];
    };

    if (!semester) {
      res.status(400).json({ message: "semester is required" });
      return;
    }

    if (!Array.isArray(subjects)) {
      res.status(400).json({ message: "subjects must be an array" });
      return;
    }

    const normalizedSubjects = subjects
      .map((subject) => ({
        name: String(subject.name || "").trim(),
        credits: parseNumber(subject.credits),
        grade: String(subject.grade || "").trim(),
        gradePoint: parseNumber(subject.gradePoint),
        marks:
          subject.marks === null || subject.marks === undefined
            ? null
            : parseNumber(subject.marks),
        maxMarks: subject.maxMarks === undefined ? 100 : parseNumber(subject.maxMarks, 100),
      }))
      .filter((subject) => subject.name && subject.grade);

    const totalCredits = normalizedSubjects.reduce((sum, subject) => sum + subject.credits, 0);
    const sgpa = calculateSGPA(normalizedSubjects);

    const semesterData = await Grade.findOneAndUpdate(
      { user: req.user.id, semester },
      {
        user: req.user.id,
        semester,
        subjects: normalizedSubjects,
        sgpa,
        totalCredits,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(semesterData);
  } catch (error) {
    console.error("Upsert semester error:", error);
    res.status(500).json({ message: "Server error saving semester" });
  }
};

export const getGrades = async (req: Request, res: Response): Promise<void> => {
  try {
    const semesters = await Grade.find({ user: req.user.id }).sort({ semester: 1 });

    const totalCredits = semesters.reduce((sum, semester) => sum + semester.totalCredits, 0);
    const weightedSgpa = semesters.reduce(
      (sum, semester) => sum + semester.sgpa * semester.totalCredits,
      0
    );

    const cgpa = totalCredits > 0 ? Number((weightedSgpa / totalCredits).toFixed(2)) : 0;

    res.status(200).json({
      semesters,
      cgpa,
      totalCredits,
      totalSemesters: semesters.length,
    });
  } catch (error) {
    console.error("Get grades error:", error);
    res.status(500).json({ message: "Server error fetching grades" });
  }
};

export const deleteSemester = async (req: Request, res: Response): Promise<void> => {
  try {
    const semesterId = req.params.id;
    const semester = await Grade.findById(semesterId);

    if (!semester) {
      res.status(404).json({ message: "Semester not found" });
      return;
    }

    if (semester.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    await Grade.findByIdAndDelete(semesterId);
    res.status(200).json({ message: "Semester deleted" });
  } catch (error) {
    console.error("Delete semester error:", error);
    res.status(500).json({ message: "Server error deleting semester" });
  }
};

export const gradeToPoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { grade, system } = req.body as { grade?: string; system?: "10point" | "4point" };

    if (!grade || !system) {
      res.status(400).json({ message: "grade and system are required" });
      return;
    }

    const normalizedGrade = grade.trim().toUpperCase();

    const tenPointMap: Record<string, number> = {
      O: 10,
      "A+": 10,
      A: 9,
      "B+": 8,
      B: 7,
      "C+": 6,
      C: 5,
      D: 4,
      F: 0,
    };

    const fourPointMap: Record<string, number> = {
      "A+": 4.0,
      A: 4.0,
      "A-": 3.7,
      "B+": 3.3,
      B: 3.0,
      "B-": 2.7,
      "C+": 2.3,
      C: 2.0,
      "C-": 1.7,
      "D+": 1.3,
      D: 1.0,
      F: 0,
    };

    const map = system === "10point" ? tenPointMap : system === "4point" ? fourPointMap : null;
    if (!map) {
      res.status(400).json({ message: "Invalid grading system" });
      return;
    }

    const gradePoint = map[normalizedGrade];
    if (gradePoint === undefined) {
      res.status(400).json({ message: "Unsupported grade for selected system" });
      return;
    }

    res.status(200).json({ grade: normalizedGrade, gradePoint });
  } catch (error) {
    console.error("Grade convert error:", error);
    res.status(500).json({ message: "Server error converting grade" });
  }
};
