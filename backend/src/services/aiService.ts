import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface AIResult {
  title: string;
  summary: string;
  keywords: string[];
  semester: number;
  subject: string;
  topic: string;
  quizQuestions: Array<{
    question: string;
    options: string[];
    answer: string;
  }>;
}

const safeDefault = (originalName: string): AIResult => ({
  title: originalName,
  summary: "No content extracted",
  keywords: [],
  semester: 1,
  subject: "General",
  topic: "General",
  quizQuestions: [],
});

export const processWithAI = async (
  text: string,
  originalName: string
): Promise<AIResult> => {
  try {
    if (!text || text.length < 50) {
      return safeDefault(originalName);
    }

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content:
            "You are an academic content analyzer for a student note-sharing platform. Analyze the provided academic content and respond ONLY with a valid JSON object. No markdown, no code blocks, no explanations. Just raw JSON.",
        },
        {
          role: "user",
          content: `Analyze this academic content and return a JSON object with exactly these fields:
{
  "title": "concise descriptive title, max 10 words",
  "summary": "5-10 sentence summary of the content",
  "keywords": ["5-8 most important keywords"],
  "semester": 4,
  "subject": "academic subject name e.g. Web Security",
  "topic": "specific topic e.g. SQL Injection",
  "quizQuestions": [
    {
      "question": "question text",
      "options": ["option1", "option2", "option3", "option4"],
      "answer": "must match one option exactly"
    }
  ]
}

Generate exactly 5 quiz questions.

Content to analyze:
${text.substring(0, 3000)}`,
        },
      ],
    });

    const content = response.choices[0].message.content ?? "";
    const clean = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as AIResult;

    if (!parsed.title || !parsed.summary || !parsed.quizQuestions) {
      return safeDefault(originalName);
    }

    return parsed;
  } catch (error) {
    console.error(
      "Error processing with AI:",
      error instanceof Error ? error.message : error
    );
    return safeDefault(originalName);
  }
};