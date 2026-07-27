import { Request, Response } from "express";
import http from "http";
import https from "https";
import { URL } from "url";
import PYQ, { PYQExamType } from "../models/PYQ";
import cloudinary from "../config/cloudinary";

const VALID_YEARS = [2023, 2024, 2025, 2026, 2027, 2028] as const;
const VALID_EXAM_TYPES: PYQExamType[] = [
  "End Semester",
  "Class Test 1 Set 1",
  "Class Test 1 Set 2",
  "Class Test 2 Set 1",
  "Class Test 2 Set 2",
];

export const uploadPYQ = async (req: Request, res: Response): Promise<void> => {
  try {
    const { semester, courseCode, courseName, year, examType, description } = req.body as {
      semester?: string | number;
      courseCode?: string;
      courseName?: string;
      year?: string | number;
      examType?: string;
      description?: string;
    };

    if (!semester || !courseCode || !courseName || !year || !examType) {
      res.status(400).json({
        message: "semester, courseCode, courseName, year and examType are required",
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "File is required" });
      return;
    }

    const yearNum = Number(year);
    if (!VALID_YEARS.includes(yearNum as (typeof VALID_YEARS)[number])) {
      res.status(400).json({ message: "Invalid year" });
      return;
    }

    if (!VALID_EXAM_TYPES.includes(examType as PYQExamType)) {
      res.status(400).json({ message: "Invalid exam type" });
      return;
    }

    const pyq = await PYQ.create({
      uploadedBy: req.user.id,
      semester: Number(semester),
      courseCode: String(courseCode).trim(),
      courseName: String(courseName).trim(),
      year: yearNum,
      examType: examType as PYQExamType,
      fileUrl: req.file.path,
      filePublicId: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size || 0,
      description: String(description || "").trim(),
    });

    res.status(201).json(pyq);
  } catch (error) {
    console.error("Upload PYQ error:", error);
    res.status(500).json({ message: "Server error uploading PYQ" });
  }
};

export const getPYQs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { semester, courseCode, year, examType } = req.query as {
      semester?: string;
      courseCode?: string;
      year?: string;
      examType?: string;
    };

    const filter: {
      semester?: number;
      courseCode?: string;
      year?: number;
      examType?: string;
    } = {};

    if (semester) filter.semester = Number(semester);
    if (courseCode) filter.courseCode = courseCode.trim();
    if (year) filter.year = Number(year);
    if (examType) filter.examType = examType;

    const pyqs = await PYQ.find(filter)
      .populate("uploadedBy", "name")
      .sort({ year: -1, examType: 1 });

    res.status(200).json({
      pyqs,
      total: pyqs.length,
    });
  } catch (error) {
    console.error("Get PYQs error:", error);
    res.status(500).json({ message: "Server error fetching PYQs" });
  }
};

export const downloadPYQ = async (req: Request, res: Response): Promise<void> => {
  try {
    const pyq = await PYQ.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloadCount: 1 } },
      { new: true }
    );

    if (!pyq) {
      res.status(404).json({ message: "PYQ not found" });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(pyq.originalName)}"`
    );

    const parsedUrl = new URL(pyq.fileUrl);
    const protocolClient = parsedUrl.protocol === "https:" ? https : http;

    protocolClient
      .get(pyq.fileUrl, (fileRes) => {
        if (fileRes.statusCode && fileRes.statusCode >= 400) {
          if (!res.headersSent) {
            res.status(500).json({ message: "Failed to fetch file stream" });
          }
          return;
        }

        fileRes.pipe(res);

        fileRes.on("error", (streamErr) => {
          console.error("PYQ stream error:", streamErr);
          if (!res.headersSent) {
            res.status(500).json({ message: "Server error downloading PYQ" });
          }
        });
      })
      .on("error", (fetchErr) => {
        console.error("PYQ fetch error:", fetchErr);
        if (!res.headersSent) {
          res.status(500).json({ message: "Server error downloading PYQ" });
        }
      });
  } catch (error) {
    console.error("Download PYQ error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error downloading PYQ" });
    }
  }
};

export const deletePYQ = async (req: Request, res: Response): Promise<void> => {
  try {
    const pyq = await PYQ.findById(req.params.id);

    if (!pyq) {
      res.status(404).json({ message: "PYQ not found" });
      return;
    }

    if (pyq.uploadedBy.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    await cloudinary.uploader.destroy(pyq.filePublicId, { resource_type: "raw" });
    await PYQ.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: "PYQ deleted" });
  } catch (error) {
    console.error("Delete PYQ error:", error);
    res.status(500).json({ message: "Server error deleting PYQ" });
  }
};
