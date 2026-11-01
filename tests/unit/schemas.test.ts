import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { excerptInSource } from "@/lib/markdown/excerpt";
import { parseMarkdown } from "@/lib/markdown/parse";
import { generateUserPrompt } from "@/lib/prompts/generate";
import { mockGeneration } from "@/lib/quiz/mock";
import { BLANK, toStoredQuestion, type GeneratedQuestion } from "@/lib/quiz/schemas";

const q = (over: Partial<GeneratedQuestion>): GeneratedQuestion => ({
  sectionRef: "S1",
  concept: "Nyquist frequency",
  image: "",
  type: "mcq",
  difficulty: "easy",
  prompt: "What is the Nyquist frequency?",
  options: ["fe/2", "2fe", "fe", "fe/4"],
  correctOptions: [0],
  acceptedAnswers: [],
  referenceAnswer: "",
  rubric: [],
  explanation: "Half the sampling rate.",
  excerpt: "La moitié de la fréquence d'échantillonnage",
  ...over,
});

describe("toStoredQuestion", () => {
  it("accepts a valid mcq", () => {
    expect(toStoredQuestion(q({}))).toMatchObject({ answer: { type: "mcq", correct: 0 } });
  });

  it("rejects mcq with wrong option count or several answers", () => {
    expect(toStoredQuestion(q({ options: ["a", "b", "c"] }))).toBeTypeOf("string");
    expect(toStoredQuestion(q({ correctOptions: [0, 1] }))).toBeTypeOf("string");
    expect(toStoredQuestion(q({ correctOptions: [7] }))).toBeTypeOf("string");
    expect(toStoredQuestion(q({ options: ["a", "a", "b", "c"] }))).toBeTypeOf("string");
  });

  it("maps true/false index to a boolean", () => {
    const tf = toStoredQuestion(q({ type: "tf", options: ["Vrai", "Faux"], correctOptions: [1] }));
    expect(tf).toMatchObject({ answer: { type: "tf", correct: false } });
  });

  it("normalizes multi answers", () => {
    const m = toStoredQuestion(q({ type: "multi", options: ["a", "b", "c", "d"], correctOptions: [2, 0, 2] }));
    expect(m).toMatchObject({ answer: { type: "multi", correct: [0, 2] } });
  });

  it("requires a blank marker and accepted answers", () => {
    expect(toStoredQuestion(q({ type: "blank", prompt: "no marker", acceptedAnswers: ["x"] }))).toBeTypeOf("string");
    const ok = toStoredQuestion(q({ type: "blank", prompt: `The ${BLANK} theorem`, options: [], correctOptions: [], acceptedAnswers: [" Nyquist "] }));
    expect(ok).toMatchObject({ options: [], answer: { type: "blank", accepted: ["Nyquist"] } });
  });

  it("requires reference and rubric for short answers", () => {
    expect(toStoredQuestion(q({ type: "short" }))).toBeTypeOf("string");
    expect(
      toStoredQuestion(q({ type: "short", referenceAnswer: "Because…", rubric: ["point"] })),
    ).toMatchObject({ answer: { type: "short", reference: "Because…", rubric: ["point"] } });
  });
});

describe("mock generation", () => {
  it("produces valid, grounded questions with the requested mix", () => {
    const md = fs.readFileSync(path.join(__dirname, "../../samples/sorting-algorithms.md"), "utf8");
    const sections = parseMarkdown(md).filter((s) => s.charLen > 300);
    const input = {
      language: "en" as const,
      parts: sections.slice(0, 2).map((s, i) => ({ ref: `S${i + 1}`, headingPath: s.headingPath, content: s.content, count: 3 })),
      types: { mcq: 2, tf: 1, short: 1, blank: 1, multi: 1 },
      difficulties: { easy: 2, medium: 2, hard: 2 },
      existing: [],
    };
    const out = mockGeneration(input);
    expect(out.questions).toHaveLength(6);
    for (const gq of out.questions) {
      const stored = toStoredQuestion(gq);
      expect(stored, JSON.stringify(gq)).not.toBeTypeOf("string");
      const part = input.parts.find((p) => p.ref === gq.sectionRef)!;
      expect(excerptInSource(gq.excerpt, part.content)).toBe(true);
    }
    // the prompt lists each section with its quota
    const prompt = generateUserPrompt(input);
    expect(prompt).toContain('id="S1"');
    expect(prompt).toContain('questions="3"');
    expect(prompt).toContain("Write exactly 6 questions in English");
  });
});
