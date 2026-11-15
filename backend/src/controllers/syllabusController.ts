import { Request, Response } from "express";
import Groq from "groq-sdk";
import SyllabusTracker from "../models/SyllabusTracker";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

type TopicStatus = "not-started" | "in-progress" | "completed";

type GeneratePayload = {
  courseCode?: string;
  courseName?: string;
  semester?: number;
  credits?: number;
  description?: string;
};

type TopicInput = {
  title?: string;
  description?: string;
  order?: number;
};

const generateTopicsWithAI = async (payload: {
  courseCode: string;
  courseName: string;
  semester: number;
  description?: string;
}): Promise<Array<{ title: string; description: string; order: number }>> => {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: "You are a university syllabus analyzer. Respond ONLY with valid JSON array.",
      },
      {
        role: "user",
        content: `Generate a detailed list of study topics for this university course.
Course: ${payload.courseName} (Code: ${payload.courseCode})
Semester: ${payload.semester}
${payload.description ? `Description: ${payload.description}` : ""}

Return a JSON array of topic objects:
[{ title: string, description: string, order: number }]

Generate 8-12 topics covering the full syllabus.
Topics should be in logical learning order.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "[]";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  const topics = parsed
    .map((topic, index) => {
      const t = topic as TopicInput;
      const title = String(t.title || "").trim();
      if (!title) return null;
      return {
        title,
        description: String(t.description || "").trim(),
        order: Number.isFinite(Number(t.order)) ? Number(t.order) : index + 1,
      };
    })
    .filter((topic): topic is { title: string; description: string; order: number } => topic !== null)
    .sort((a, b) => a.order - b.order);

  return topics;
};

const calculateProgress = (statuses: TopicStatus[]) => {
  if (statuses.length === 0) return 0;
  const completed = statuses.filter((status) => status === "completed").length;
  return Number(((completed / statuses.length) * 100).toFixed(1));
};

export const generateSyllabus = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as GeneratePayload;

    if (!body.courseName || !body.semester) {
      res.status(400).json({ message: "courseName and semester are required" });
      return;
    }

    const topics = await generateTopicsWithAI({
      courseCode: String(body.courseCode || "").trim(),
      courseName: String(body.courseName).trim(),
      semester: Number(body.semester),
      description: body.description,
    });

    const subject = await SyllabusTracker.create({
      user: req.user.id,
      courseCode: String(body.courseCode || "").trim(),
      courseName: String(body.courseName).trim(),
      semester: Number(body.semester),
      credits: Number(body.credits || 0),
      topics: topics.map((topic) => ({
        ...topic,
        status: "not-started",
      })),
      overallProgress: 0,
    });

    res.status(201).json(subject);
  } catch (error) {
    console.error("Generate syllabus error:", error);
    res.status(500).json({ message: "Failed to generate syllabus" });
  }
};

export const getSyllabus = async (req: Request, res: Response): Promise<void> => {
  try {
    const subjects = await SyllabusTracker.find({ user: req.user.id }).sort({
      semester: 1,
      courseName: 1,
    });

    res.status(200).json({ subjects });
  } catch (error) {
    console.error("Get syllabus error:", error);
    res.status(500).json({ message: "Failed to fetch syllabus" });
  }
};

export const updateTopicStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subjectId, topicId } = req.params;
    const { status } = req.body as { status?: TopicStatus };

    if (!status || !["not-started", "in-progress", "completed"].includes(status)) {
      res.status(400).json({ message: "Invalid status" });
      return;
    }

    const subject = await SyllabusTracker.findById(subjectId);
    if (!subject) {
      res.status(404).json({ message: "Subject not found" });
      return;
    }

    if (subject.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    const topicIndex = subject.topics.findIndex((topic) => topic._id?.toString() === topicId);
    if (topicIndex === -1) {
      res.status(404).json({ message: "Topic not found" });
      return;
    }

    subject.topics[topicIndex].status = status;
    subject.overallProgress = calculateProgress(
      subject.topics.map((item) => item.status as TopicStatus)
    );

    await subject.save();
    res.status(200).json(subject);
  } catch (error) {
    console.error("Update topic status error:", error);
    res.status(500).json({ message: "Failed to update topic status" });
  }
};

export const deleteSubject = async (req: Request, res: Response): Promise<void> => {
  try {
    const subject = await SyllabusTracker.findById(req.params.subjectId);
    if (!subject) {
      res.status(404).json({ message: "Subject not found" });
      return;
    }

    if (subject.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    await SyllabusTracker.findByIdAndDelete(req.params.subjectId);
    res.status(200).json({ message: "Subject deleted" });
  } catch (error) {
    console.error("Delete subject error:", error);
    res.status(500).json({ message: "Failed to delete subject" });
  }
};

export const seedSemester4Syllabus = async (req: Request, res: Response): Promise<void> => {
  try {
    const subjects = [
      { courseCode: "BNC40105", courseName: "Windows Server Administration", credits: 3 },
      { courseCode: "BNC49106", courseName: "Windows Server Administration Lab", credits: 2 },
      { courseCode: "BNC40107", courseName: "Web Application Penetration Testing", credits: 3 },
      { courseCode: "BNC49108", courseName: "Web App Penetration Testing Lab", credits: 2 },
      { courseCode: "BNC40109", courseName: "Threat Modelling", credits: 4 },
      { courseCode: "BNC40204", courseName: "Blockchain and Cryptocurrency", credits: 4 },
      { courseCode: "AEC09001", courseName: "Communicative English Lab", credits: 2 },
    ];

    await SyllabusTracker.deleteMany({ user: req.user.id, semester: 4 });

    const createdSubjects = [];
    for (const subject of subjects) {
      const topics = await generateTopicsWithAI({
        courseCode: subject.courseCode,
        courseName: subject.courseName,
        semester: 4,
      });

      const created = await SyllabusTracker.create({
        user: req.user.id,
        courseCode: subject.courseCode,
        courseName: subject.courseName,
        semester: 4,
        credits: subject.credits,
        topics: topics.map((topic) => ({
          ...topic,
          status: "not-started",
        })),
        overallProgress: 0,
      });

      createdSubjects.push(created);
    }

    res.status(201).json({
      subjects: createdSubjects,
      message: "Semester 4 syllabus loaded",
    });
  } catch (error) {
    console.error("Seed semester 4 syllabus error:", error);
    res.status(500).json({ message: "Failed to seed semester 4 syllabus" });
  }
};
