import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface AIResult {
  title: string;
  summary: string;
  keywords: string[];
  quizQuestions: Array<{
    question: string;
    options: string[];
    answer: string;
  }>;
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

const MAX_RESPONSE_PREVIEW_LENGTH = 400;

const toSingleLinePreview = (value: string): string =>
  value.replace(/\s+/g, " ").trim().slice(0, MAX_RESPONSE_PREVIEW_LENGTH);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const validateQuizQuestions = (
  value: unknown
): ValidationResult<AIResult["quizQuestions"]> => {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "quizQuestions must be an array" };
  }

  if (value.length !== 5) {
    return { ok: false, reason: "quizQuestions must contain exactly 5 questions" };
  }

  const questions: AIResult["quizQuestions"] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "object" || item === null) {
      return { ok: false, reason: `quizQuestions[${index}] must be an object` };
    }

    const question = (item as { question?: unknown }).question;
    const options = (item as { options?: unknown }).options;
    const answer = (item as { answer?: unknown }).answer;

    if (!isNonEmptyString(question)) {
      return { ok: false, reason: `quizQuestions[${index}].question must be a non-empty string` };
    }

    if (
      !Array.isArray(options) ||
      options.length !== 4 ||
      options.some((option) => !isNonEmptyString(option))
    ) {
      return {
        ok: false,
        reason: `quizQuestions[${index}].options must have exactly 4 non-empty strings`,
      };
    }

    if (!isNonEmptyString(answer)) {
      return { ok: false, reason: `quizQuestions[${index}].answer must be a non-empty string` };
    }

    const normalizedOptions = options.map((option) => option.trim());
    const normalizedAnswer = answer.trim();
    if (!normalizedOptions.includes(normalizedAnswer)) {
      return { ok: false, reason: `quizQuestions[${index}].answer must match one of options` };
    }

    questions.push({
      question: question.trim(),
      options: normalizedOptions,
      answer: normalizedAnswer,
    });
  }

  return { ok: true, value: questions };
};

const parseAndValidateAIResult = (rawContent: string): ValidationResult<AIResult> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent) as unknown;
  } catch (error) {
    return {
      ok: false,
      reason: `parsing failed: ${error instanceof Error ? error.message : "Unknown parse error"}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "response is not an object" };
  }

  const candidate = parsed as {
    title?: unknown;
    summary?: unknown;
    keywords?: unknown;
    quizQuestions?: unknown;
  };

  if (!isNonEmptyString(candidate.title)) {
    return { ok: false, reason: "title must be a non-empty string" };
  }

  if (!isNonEmptyString(candidate.summary)) {
    return { ok: false, reason: "summary must be a non-empty string" };
  }

  if (
    !Array.isArray(candidate.keywords) ||
    candidate.keywords.some((keyword) => !isNonEmptyString(keyword))
  ) {
    return { ok: false, reason: "keywords must be an array of non-empty strings" };
  }

  const quizValidation = validateQuizQuestions(candidate.quizQuestions);
  if (!quizValidation.ok) {
    return { ok: false, reason: quizValidation.reason };
  }

  return {
    ok: true,
    value: {
      title: candidate.title.trim(),
      summary: candidate.summary.trim(),
      keywords: candidate.keywords.map((keyword) => keyword.trim()),
      quizQuestions: quizValidation.value,
    },
  };
};

export const processWithAI = async (
  text: string,
  originalName: string
): Promise<AIResult | null> => {
  try {
    if (!text || text.length < 50) {
      console.error("AI processing failed", {
        stage: "validation_input",
        error: "Insufficient extracted content",
        noteName: originalName,
      });
      return null;
    }

    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an academic content analyzer operating inside a university student resource platform. Analyze extracted text from uploaded academic documents. Stay strictly grounded in the supplied content. Do not invent facts. Do not add markdown. Do not add explanations outside the JSON object. Return only one valid JSON object.",
        },
        {
          role: "user",
          content: `Analyze the supplied academic content and return exactly one JSON object with this structure:
{
  "title": "string",
  "summary": "string",
  "keywords": ["string", "string"],
  "quizQuestions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": "string"
    }
  ]
}

Rules:
- title: concise academic title, maximum 10 words, accurately represent supplied content, do not invent topics not present.
- summary: 5 to 8 clear academic sentences, summarize actual extracted content, preserve important technical terminology, suitable for university students, no unsupported facts, no references to being an AI, no phrases like "the document provided".
- keywords: 5 to 8 unique important keywords, concise phrases derived from supplied content, no generic filler like "education", "student", or "document" unless genuinely relevant.
- quizQuestions: generate exactly 5 questions.
- every question must be based only on supplied content, test meaningful understanding, not duplicate another question, have exactly 4 options, have exactly one correct answer, and answer must exactly match one option.
- avoid ambiguous wording and avoid "all of the above".
- if content is insufficient for ideal coverage, do not fabricate information; keep questions answerable from available content.

Academic content:
${text.substring(0, 3000)}

Return JSON only.`,
        },
      ],
    });

    const content = response.choices[0].message.content ?? "";
    const clean = content.trim();
    const result = parseAndValidateAIResult(clean);

    if (!result.ok) {
      console.error("AI response validation failed", {
        stage: "validation",
        error: result.reason,
        responsePreview: toSingleLinePreview(clean),
      });
      return null;
    }

    return result.value;
  } catch (error) {
    console.error("AI processing failed", {
      stage: "groq_request",
      error: error instanceof Error ? error.message : "Unknown AI processing error",
    });
    return null;
  }
};
