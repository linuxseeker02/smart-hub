import { Request, Response } from "express";
import Attendance from "../models/Attendance";

export const addSubject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subject, minimumRequired } = req.body as {
      subject?: string;
      minimumRequired?: number;
    };

    if (!subject || !subject.trim()) {
      res.status(400).json({ message: "Subject is required" });
      return;
    }

    const existing = await Attendance.findOne({
      user: req.user.id,
      subject: { $regex: `^${subject.trim()}$`, $options: "i" },
    });

    if (existing) {
      res.status(400).json({ message: "Subject already exists" });
      return;
    }

    const attendance = await Attendance.create({
      user: req.user.id,
      subject: subject.trim(),
      minimumRequired: minimumRequired ?? 75,
    });

    res.status(201).json(attendance);
  } catch (error) {
    console.error("Add subject error:", error);
    res.status(500).json({ message: "Server error creating subject" });
  }
};

export const getAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const attendanceRecords = await Attendance.find({ user: req.user.id }).sort({
      createdAt: -1,
    });

    const subjects = attendanceRecords.map((record) => {
      const totalClasses = record.totalClasses;
      const attendedClasses = record.attendedClasses;
      const minimumRequired = record.minimumRequired;
      const requiredRatio = minimumRequired / 100;
      const percentage = totalClasses > 0 ? (attendedClasses / totalClasses) * 100 : 0;

      let status: "safe" | "warning" | "danger" = "safe";
      if (percentage < minimumRequired - 10) {
        status = "danger";
      } else if (percentage < minimumRequired) {
        status = "warning";
      }

      const classesNeededRaw =
        requiredRatio < 1
          ? Math.ceil(
              (minimumRequired * totalClasses / 100 - attendedClasses) /
                (1 - requiredRatio)
            )
          : 0;

      const canAffordRaw =
        requiredRatio > 0
          ? Math.floor(
              (attendedClasses - requiredRatio * totalClasses) / requiredRatio
            )
          : 0;

      return {
        ...record.toObject(),
        percentage: Number(percentage.toFixed(2)),
        status,
        classesNeededToReach: Math.max(0, classesNeededRaw),
        canAffordToMiss: Math.max(0, canAffordRaw),
      };
    });

    res.status(200).json({ subjects });
  } catch (error) {
    console.error("Get attendance error:", error);
    res.status(500).json({ message: "Server error fetching attendance" });
  }
};

export const markAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subjectId } = req.params;
    const { date, status, note } = req.body as {
      date?: string;
      status?: "present" | "absent" | "late";
      note?: string;
    };

    if (!date || !status) {
      res.status(400).json({ message: "date and status are required" });
      return;
    }

    if (!["present", "absent", "late"].includes(status)) {
      res.status(400).json({ message: "status must be present, absent, or late" });
      return;
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      res.status(400).json({ message: "date must be a valid date" });
      return;
    }

    const subject = await Attendance.findById(subjectId);
    if (!subject) {
      res.status(404).json({ message: "Subject not found" });
      return;
    }

    if (subject.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    subject.records.push({
      date: parsedDate,
      status,
      note: (note || "").trim(),
    });
    subject.totalClasses += 1;
    if (status === "present" || status === "late") {
      subject.attendedClasses += 1;
    }

    await subject.save();
    res.status(200).json(subject);
  } catch (error) {
    console.error("Mark attendance error:", error);
    res.status(500).json({ message: "Server error marking attendance" });
  }
};

export const updateSubject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subjectId } = req.params;
    const { subject, minimumRequired } = req.body as {
      subject?: string;
      minimumRequired?: number;
    };

    const attendance = await Attendance.findById(subjectId);
    if (!attendance) {
      res.status(404).json({ message: "Subject not found" });
      return;
    }

    if (attendance.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    if (subject !== undefined) attendance.subject = subject.trim();
    if (minimumRequired !== undefined) attendance.minimumRequired = minimumRequired;

    await attendance.save();
    res.status(200).json(attendance);
  } catch (error) {
    console.error("Update subject error:", error);
    res.status(500).json({ message: "Server error updating subject" });
  }
};

export const deleteSubject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subjectId } = req.params;
    const attendance = await Attendance.findById(subjectId);
    if (!attendance) {
      res.status(404).json({ message: "Subject not found" });
      return;
    }

    if (attendance.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    await Attendance.findByIdAndDelete(subjectId);
    res.status(200).json({ message: "Subject deleted" });
  } catch (error) {
    console.error("Delete subject error:", error);
    res.status(500).json({ message: "Server error deleting subject" });
  }
};
