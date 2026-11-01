import { describe, expect, it } from "vitest";
import type { questions, quizzes } from "@/lib/db/schema";
import { QuizExport, toExportJson, toMarkdown } from "@/lib/quiz/portable";

const quiz = { id: "z", title: "Sorting", language: "en" } as typeof quizzes.$inferSelect;
const q = (over: Partial<typeof questions.$inferSelect>) =>
  ({
    id: "q",
    quizId: "z",
    ord: 0,
    type: "mcq",
    difficulty: "easy",
    prompt: "Which sort is stable?",
    options: ["Quicksort", "Merge sort", "Heapsort", "Selection sort"],
    answer: { type: "mcq", correct: 1 },
    explanation: "Merge sort keeps equal elements in order.",
    sectionId: "s",
    sectionPath: "Sorting > Merge Sort",
    excerpt: "It is stable",
    deletedAt: null,
    ...over,
  }) as typeof questions.$inferSelect;

describe("quiz export", () => {
  const qs = [
    q({}),
    q({ id: "q2", type: "tf", options: ["True", "False"], answer: { type: "tf", correct: false }, prompt: "Quicksort is stable." }),
    q({ id: "q3", type: "blank", options: [], answer: { type: "blank", accepted: ["pivot"] }, prompt: "Quicksort picks a ____." }),
  ];

  it("round-trips through the import schema", () => {
    const json = JSON.parse(JSON.stringify(toExportJson(quiz, qs)));
    const parsed = QuizExport.parse(json);
    expect(parsed.questions).toHaveLength(3);
    expect(parsed.questions[0]).not.toHaveProperty("sectionId");
    expect(parsed.questions[1].answer).toEqual({ type: "tf", correct: false });
  });

  it("rejects files that aren't exports", () => {
    expect(QuizExport.safeParse({ hello: 1 }).success).toBe(false);
    expect(QuizExport.safeParse({ ...toExportJson(quiz, qs), questions: [] }).success).toBe(false);
  });

  it("renders Markdown with an answer key", () => {
    const md = toMarkdown(quiz, qs);
    expect(md).toContain("# Sorting");
    expect(md).toContain("   B. Merge sort");
    expect(md).toContain("## Corrigé");
    expect(md).toContain("1. **B. Merge sort**");
    expect(md).toContain("2. **False**");
    expect(md).toContain("3. **pivot**");
  });
});

describe("publish payload", () => {
  it("keeps prepared key points and study tips", () => {
    const parsed = QuizExport.safeParse({
      format: "mdquiz-quiz",
      version: 1,
      quiz: { title: "T", language: "fr", studyTips: { "A > B": "Relis B." } },
      questions: [
        {
          type: "short",
          difficulty: "medium",
          prompt: "Pourquoi ?",
          options: [],
          answer: { type: "short", reference: "Parce que.", rubric: ["raison"], keyPoints: [{ point: "raison", keywords: ["parce"] }] },
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.quiz.studyTips).toEqual({ "A > B": "Relis B." });
    expect(parsed.data.questions[0].answer).toMatchObject({ keyPoints: [{ point: "raison", keywords: ["parce"] }] });
  });

  it("rejects key points without keywords", () => {
    const bad = QuizExport.safeParse({
      format: "mdquiz-quiz",
      version: 1,
      quiz: { title: "T", language: "en" },
      questions: [
        { type: "short", difficulty: "easy", prompt: "Why?", options: [], answer: { type: "short", reference: "r", rubric: [], keyPoints: [{ point: "p", keywords: [] }] } },
      ],
    });
    expect(bad.success).toBe(false);
  });
});
