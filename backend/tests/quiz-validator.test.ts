import { describe, expect, it, vi } from "vitest";

vi.mock("groq-sdk", () => ({
  default: class Groq {},
}));

import { validateQuizQuestions } from "../src/services/aiService";

const question = (answer = "A") => ({
  question: "Which option is correct?",
  options: ["A", "B", "C", "D"],
  answer,
});

describe("AI quiz validator", () => {
  it.each([0, 4, 6])(
    "rejects an array with %s questions",
    (count) => {
      const result = validateQuizQuestions(Array.from({ length: count }, () => question()));

      expect(result).toEqual({
        ok: false,
        reason: "quizQuestions must contain exactly 5 questions",
      });
    }
  );

  it("accepts exactly five valid questions", () => {
    expect(validateQuizQuestions(Array.from({ length: 5 }, () => question()))).toEqual({
      ok: true,
      value: Array.from({ length: 5 }, () => question()),
    });
  });

  it("rejects malformed question content in a five-question response", () => {
    const malformedOptions = Array.from({ length: 5 }, () => question());
    malformedOptions[0] = { ...question(), options: ["A", "B"] };
    expect(validateQuizQuestions(malformedOptions)).toEqual({
      ok: false,
      reason: "quizQuestions[0].options must have exactly 4 non-empty strings",
    });

    const malformedAnswer = Array.from({ length: 5 }, () => question());
    malformedAnswer[0] = { ...question(), answer: "E" };
    expect(validateQuizQuestions(malformedAnswer)).toEqual({
      ok: false,
      reason: "quizQuestions[0].answer must match one of options",
    });
  });

  it("rejects non-array quiz output", () => {
    expect(validateQuizQuestions({ questions: [] })).toEqual({
      ok: false,
      reason: "quizQuestions must be an array",
    });
  });
});
