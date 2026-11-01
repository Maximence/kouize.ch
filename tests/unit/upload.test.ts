import { describe, expect, it } from "vitest";
import { isEmail, normalizeEmail, safeNext } from "@/lib/auth/email";
import { sniffNote } from "@/lib/note-files";
import { aiPrompt, parseUpload } from "@/lib/quiz/upload";

const question = {
  type: "mcq",
  difficulty: "easy",
  prompt: "Which sort is stable?",
  options: ["Quicksort", "Merge sort", "Heapsort", "Selection sort"],
  answer: { type: "mcq", correct: 1 },
  explanation: "Merge sort keeps equal keys in order.",
};
const file = (questions: unknown[], extra: object = {}) =>
  JSON.stringify({ format: "mdquiz-quiz", version: 1, quiz: { title: "Sorting", language: "en" }, questions, ...extra });

describe("parseUpload", () => {
  it("accepts a studio export as is", () => {
    const res = parseUpload(file([question]));
    expect(res.ok && res.data.questions[0].answer).toEqual({ type: "mcq", correct: 1 });
  });

  it("finds the JSON inside an AI's chatty answer with code fences", () => {
    const res = parseUpload(`Sure! Here is your quiz:\n\n\`\`\`json\n${file([question])}\n\`\`\`\nGood luck!`);
    expect(res.ok).toBe(true);
  });

  it("fills in a missing envelope", () => {
    const res = parseUpload(JSON.stringify({ title: "Bare", language: "fr", questions: [question] }));
    expect(res.ok && res.data.quiz).toMatchObject({ title: "Bare", language: "fr" });
  });

  it("names the question that's wrong", () => {
    const bad = { ...question, answer: { type: "mcq", correct: 7 } };
    const res = parseUpload(file([question, bad]));
    expect(res).toEqual({ ok: false, error: "Question 2 : sa bonne réponse n'existe pas." });
  });

  it("rejects an answer of another type", () => {
    const res = parseUpload(file([{ ...question, answer: { type: "tf", correct: true } }]));
    expect(!res.ok && res.error).toMatch(/Question 1 : sa réponse est de type « tf »/);
  });

  it("normalizes true/false options and blanks", () => {
    const res = parseUpload(
      file(
        [
          { ...question, type: "tf", options: [], answer: { type: "tf", correct: false } },
          { ...question, type: "blank", prompt: "Merge _______ is stable.", options: [], answer: { type: "blank", accepted: [" sort "] } },
        ],
        { quiz: { title: "Tri", language: "fr" } },
      ),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.questions[0].options).toEqual(["Vrai", "Faux"]);
    expect(res.data.questions[1].prompt).toBe("Merge ____ is stable.");
    expect(res.data.questions[1].answer).toEqual({ type: "blank", accepted: ["sort"] });
  });

  it("uses the reference as rubric when a short answer has none", () => {
    const res = parseUpload(
      file([{ ...question, type: "short", options: [], answer: { type: "short", reference: "It splits and merges.", rubric: [] } }]),
    );
    expect(res.ok && res.data.questions[0].answer).toMatchObject({ rubric: ["It splits and merges."] });
  });

  it("explains invalid JSON and empty quizzes", () => {
    expect(parseUpload("not json at all")).toMatchObject({ ok: false, error: expect.stringMatching(/JSON valide/) });
    expect(parseUpload(file([]))).toMatchObject({ ok: false, error: expect.stringMatching(/aucune question/) });
  });

  it("the AI prompt's own example is accepted", () => {
    const example = /\{\n  "format"[\s\S]*?\n\}/.exec(aiPrompt())![0];
    expect(parseUpload(example).ok).toBe(true);
  });
});

describe("account helpers", () => {
  it("normalizes and checks emails", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
    expect(isEmail("ana@example.com")).toBe(true);
    expect(isEmail("ana@example")).toBe(false);
    expect(isEmail("a b@example.com")).toBe(false);
  });

  it("only redirects to paths on this site", () => {
    expect(safeNext("/k/m55")).toBe("/k/m55");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext(undefined, "/join")).toBe("/join");
  });
});

describe("notes files", () => {
  const text = (s: string) => Buffer.from(s, "utf8");
  it("accepts real PDFs, text and Markdown", () => {
    expect(sniffNote(Buffer.from("%PDF-1.7\n…"), "cours.pdf")).toBe("application/pdf");
    expect(sniffNote(text("Résumé du cours"), "notes.TXT")).toBe("text/plain");
    expect(sniffNote(text("# Titre\n\nTexte"), "notes.md")).toBe("text/markdown");
  });

  it("refuses renamed or binary files", () => {
    expect(sniffNote(text("<html>"), "fake.pdf")).toBeNull();
    expect(sniffNote(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]), "image.md")).toBeNull();
    expect(sniffNote(Buffer.from([0xff, 0xfe, 0xfd]), "latin.txt")).toBeNull();
    expect(sniffNote(text("hello"), "notes.docx")).toBeNull();
  });
});
