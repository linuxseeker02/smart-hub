import { Request, Response } from "express";
import StudentProfile from "../models/StudentProfile";

type ProfilePayload = {
  fullName?: string;
  rollNumber?: string;
  department?: string;
  program?: string;
  semester?: number;
  section?: string;
  batch?: string;
  university?: string;
  phone?: string;
  photoUrl?: string;
  studyStreak?: number;
  lastStudyDate?: string | null;
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = await StudentProfile.findOne({ user: req.user.id });

    if (!profile) {
      res.status(200).json({
        user: req.user.id,
        fullName: "",
        rollNumber: "",
        department: "",
        program: "",
        semester: 1,
        section: "",
        batch: "",
        university: "",
        phone: "",
        photoUrl: "",
        studyStreak: 0,
        lastStudyDate: null,
      });
      return;
    }

    res.status(200).json(profile);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server error fetching profile" });
  }
};

export const upsertProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as ProfilePayload;

    const payload = {
      fullName: String(body.fullName ?? "").trim(),
      rollNumber: String(body.rollNumber ?? "").trim(),
      department: String(body.department ?? "").trim(),
      program: String(body.program ?? "").trim(),
      semester: Number(body.semester ?? 1),
      section: String(body.section ?? "").trim(),
      batch: String(body.batch ?? "").trim(),
      university: String(body.university ?? "").trim(),
      phone: String(body.phone ?? "").trim(),
      photoUrl: String(body.photoUrl ?? "").trim(),
      studyStreak: Number(body.studyStreak ?? 0),
      lastStudyDate: body.lastStudyDate ? new Date(body.lastStudyDate) : null,
    };

    const profile = await StudentProfile.findOneAndUpdate(
      { user: req.user.id },
      { user: req.user.id, ...payload },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      }
    );

    res.status(200).json(profile);
  } catch (error) {
    console.error("Upsert profile error:", error);
    res.status(500).json({ message: "Server error saving profile" });
  }
};
