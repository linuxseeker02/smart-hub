import { Request, Response } from "express";
import StudySession from "../models/StudySession";
import StudentProfile from "../models/StudentProfile";

type LogSessionPayload = {
  subject?: string;
  duration?: number;
  type?: "focus" | "short-break" | "long-break";
  date?: string;
};

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

export const logSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as LogSessionPayload;
    const today = new Date();
    const todayStr = toDateString(today);
    const sessionDate = body.date || todayStr;

    if (!body.duration || Number(body.duration) <= 0) {
      res.status(400).json({ message: "duration is required" });
      return;
    }

    const session = await StudySession.create({
      user: req.user.id,
      subject: String(body.subject || "General").trim() || "General",
      duration: Number(body.duration),
      type: body.type || "focus",
      date: sessionDate,
      completedAt: new Date(),
    });

    const profile = await StudentProfile.findOne({ user: req.user.id });
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toDateString(yesterday);

    if (profile) {
      const lastStudyDateStr = profile.lastStudyDate ? toDateString(profile.lastStudyDate) : null;

      if (lastStudyDateStr === todayStr) {
        // streak unchanged
      } else if (lastStudyDateStr === yesterdayStr) {
        profile.studyStreak += 1;
      } else {
        profile.studyStreak = 1;
      }

      profile.lastStudyDate = new Date(`${todayStr}T00:00:00.000Z`);
      await profile.save();
    } else {
      await StudentProfile.create({
        user: req.user.id,
        studyStreak: 1,
        lastStudyDate: new Date(`${todayStr}T00:00:00.000Z`),
      });
    }

    res.status(201).json(session);
  } catch (error) {
    console.error("Log session error:", error);
    res.status(500).json({ message: "Server error logging session" });
  }
};

export const getSessionStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = Math.max(1, Number(req.query.days || 7));
    const today = new Date();
    const todayStr = toDateString(today);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (days - 1));
    const startDateStr = toDateString(startDate);

    const sessions = await StudySession.find({
      user: req.user.id,
      date: { $gte: startDateStr, $lte: todayStr },
    }).sort({ completedAt: -1 });

    const totalMinutes = sessions.reduce((sum, session) => sum + session.duration, 0);
    const todayMinutes = sessions
      .filter((session) => session.date === todayStr)
      .reduce((sum, session) => sum + session.duration, 0);

    const weeklyData: Array<{ date: string; minutes: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = toDateString(date);
      const minutes = sessions
        .filter((session) => session.date === dateStr)
        .reduce((sum, session) => sum + session.duration, 0);
      weeklyData.push({ date: dateStr, minutes });
    }

    const subjectBreakdown: Record<string, number> = {};
    sessions.forEach((session) => {
      const subject = session.subject || "General";
      subjectBreakdown[subject] = (subjectBreakdown[subject] || 0) + session.duration;
    });

    const profile = await StudentProfile.findOne({ user: req.user.id }).select("studyStreak");

    res.status(200).json({
      totalMinutes,
      todayMinutes,
      weeklyData,
      subjectBreakdown,
      streak: profile?.studyStreak || 0,
    });
  } catch (error) {
    console.error("Get session stats error:", error);
    res.status(500).json({ message: "Server error fetching session stats" });
  }
};
