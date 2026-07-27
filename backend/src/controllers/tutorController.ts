import { Request, Response } from "express";
import Groq from "groq-sdk";
import Note from "../models/Note";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export const chat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { noteId, message, history } = req.body as {
      noteId?: string;
      message?: string;
      history?: ChatHistoryMessage[];
    };

    if (!noteId || !message || !message.trim()) {
      res.status(400).json({ message: "noteId and message are required" });
      return;
    }

    const note = await Note.findById(noteId).select("title summary keywords");

    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }

    const systemPrompt = `You are an AI tutor helping a student understand academic content.
You have access to the following note:
Title: ${note.title}
Summary: ${note.summary || "No summary available"}
Keywords: ${note.keywords?.join(", ") || "None"}

Answer questions based on this content. Be concise, clear and educational.
If the question is unrelated to the note, politely redirect the student back to the topic.`;

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (item): item is ChatHistoryMessage =>
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string" &&
              item.content.trim().length > 0
          )
          .slice(-10)
      : [];

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 500,
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        ...safeHistory,
        { role: "user", content: message.trim() },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";

    res.status(200).json({ reply });
  } catch (error) {
    console.error("Tutor chat error:", error);
    res.status(500).json({ message: "AI tutor unavailable" });
  }
};
