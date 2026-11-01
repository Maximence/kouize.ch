import { EXPORT_FORMAT, QuizExport } from "./portable";
import { BLANK } from "./schemas";

// Students upload quizzes they made with their own AI (ChatGPT, Claude, Gemini…)
// or exported from a studio. AI output is often a little off, so the text is
// cleaned up before the strict checks, and every error names the question.

export const MAX_UPLOAD_QUESTIONS = 200;

/** The JSON object inside what was pasted or uploaded: tolerates ```json fences and chatter around it. */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON");
    return JSON.parse(body.slice(start, end + 1));
  }
}

/** Fills in the envelope an AI tends to leave out: `format`, `version`, or the `quiz` object itself. */
function withEnvelope(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const o = json as Record<string, unknown>;
  if (o.format) return o;
  const quiz = (o.quiz as Record<string, unknown> | undefined) ?? { title: o.title, language: o.language };
  return { format: EXPORT_FORMAT, version: 1, quiz, questions: o.questions, images: o.images };
}

type Question = QuizExport["questions"][number];

/** Per-type rules the runner relies on. Returns the cleaned question, or why it can't be used. */
function checkQuestion(q: Question, language: "fr" | "en"): Question | string {
  const prompt = q.prompt.trim();
  const options = q.options.map((o) => o.trim());
  const a = q.answer;
  if (a.type !== q.type) return `sa réponse est de type « ${a.type} » mais la question est de type « ${q.type} »`;
  const inRange = (i: number) => i >= 0 && i < options.length;
  switch (a.type) {
    case "mcq":
      if (options.length < 2 || options.some((o) => !o)) return "une question à choix multiple a besoin d'au moins 2 options";
      if (!inRange(a.correct)) return "sa bonne réponse n'existe pas";
      return { ...q, prompt, options };
    case "multi":
      if (options.length < 2 || options.some((o) => !o)) return "une question à plusieurs réponses a besoin d'au moins 2 options";
      if (!a.correct.every(inRange)) return "une de ses bonnes réponses n'existe pas";
      return { ...q, prompt, options, answer: { ...a, correct: [...new Set(a.correct)].sort((x, y) => x - y) } };
    case "tf":
      // Index 0 is "True" everywhere in KOUIZE.
      return { ...q, prompt, options: language === "fr" ? ["Vrai", "Faux"] : ["True", "False"] };
    case "short": {
      const reference = a.reference.trim();
      if (!reference) return "une question à réponse courte a besoin d'une réponse de référence";
      const rubric = a.rubric.map((r) => r.trim()).filter(Boolean);
      return { ...q, prompt, options: [], answer: { ...a, reference, rubric: rubric.length ? rubric : [reference] } };
    }
    case "blank": {
      const accepted = a.accepted.map((x) => x.trim()).filter(Boolean);
      if (!accepted.length) return "un texte à trous a besoin d'au moins une réponse acceptée";
      // AIs write blanks with any number of underscores.
      const withBlank = prompt.replace(/_{3,}/, BLANK);
      if (!withBlank.includes(BLANK)) return `un texte à trous doit contenir un trou écrit ${BLANK}`;
      return { ...q, prompt: withBlank, options: [], answer: { ...a, accepted } };
    }
  }
}

/** Parse an uploaded quiz. Errors are written for the student who has to fix the file (or ask their AI to). */
export function parseUpload(text: string): { ok: true; data: QuizExport } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = withEnvelope(extractJson(text));
  } catch {
    return { ok: false, error: "Ce n'est pas du JSON valide. Demande à ton IA de répondre uniquement avec le JSON." };
  }
  const parsed = QuizExport.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const [first, index, ...rest] = issue.path;
    const where =
      first === "questions" && typeof index === "number"
        ? `question ${index + 1}${rest.length ? ` (${rest.join(".")})` : ""}`
        : issue.path.join(".") || "fichier";
    return { ok: false, error: `Ce n'est pas un fichier de quiz : ${where} : ${issue.message}` };
  }
  const data = parsed.data;
  if (!data.quiz.title.trim()) return { ok: false, error: "Le quiz a besoin d'un titre." };
  if (data.questions.length > MAX_UPLOAD_QUESTIONS) {
    return { ok: false, error: `Ça fait ${data.questions.length} questions : découpe-le en quiz de ${MAX_UPLOAD_QUESTIONS} questions maximum.` };
  }
  const questions: Question[] = [];
  for (const [i, q] of data.questions.entries()) {
    const checked = checkQuestion(q, data.quiz.language);
    if (typeof checked === "string") return { ok: false, error: `Question ${i + 1} : ${checked}.` };
    if (!checked.prompt) return { ok: false, error: `La question ${i + 1} n'a pas de texte.` };
    questions.push(checked);
  }
  return { ok: true, data: { ...data, quiz: { ...data.quiz, title: data.quiz.title.trim() }, questions } };
}

/** What a student pastes into their own AI, followed by their notes, to get a file KOUIZE accepts. */
export function aiPrompt(): string {
  return `Fais un quiz à partir de mes notes de cours ci-dessous. Utilise uniquement ce que disent les notes.

Réponds uniquement avec du JSON (aucun texte avant ou après), exactement dans ce format :

{
  "format": "${EXPORT_FORMAT}",
  "version": 1,
  "quiz": { "title": "Titre court du quiz", "language": "fr" },
  "questions": [
    {
      "type": "mcq",
      "difficulty": "easy",
      "prompt": "Quel algorithme de tri est stable ?",
      "options": ["Tri rapide", "Tri fusion", "Tri par tas", "Tri par sélection"],
      "answer": { "type": "mcq", "correct": 1 },
      "explanation": "Pourquoi c'est la bonne réponse, en 1 à 3 phrases.",
      "excerpt": "Une courte citation de mes notes qui justifie la réponse.",
      "sectionPath": "Titre > Sous-titre d'où vient la question"
    }
  ]
}

Règles :
- "language" vaut "fr" ou "en", la langue de mes notes.
- "difficulty" vaut "easy", "medium" ou "hard".
- "type" est l'un de ceux-ci, et "answer" doit utiliser le même type :
  - "mcq" (une seule bonne réponse) : 4 options, answer { "type": "mcq", "correct": <index à partir de 0> }
  - "multi" (plusieurs bonnes réponses) : 4 à 6 options, answer { "type": "multi", "correct": [<index>] }
  - "tf" (vrai/faux) : options [], answer { "type": "tf", "correct": true ou false }
  - "short" (réponse rédigée) : options [], answer { "type": "short", "reference": "une réponse modèle en 1 à 3 phrases", "rubric": ["2 à 4 points clés qu'une réponse complète doit contenir"], "keyPoints": [{ "point": "un point clé", "keywords": ["mots", "qui", "le", "montrent"] }] }
  - "blank" (texte à trous) : le prompt contient ____ exactement une fois, options [], answer { "type": "blank", "accepted": ["le mot manquant", "variantes courantes"] }
- Les réponses courtes sont corrigées par mots-clés : donne 3 à 8 mots-clés par point clé (synonymes compris).
- Fais 10 à 20 questions qui testent chacune une idée différente, en mélangeant les types et les difficultés.

Mes notes :

`;
}
