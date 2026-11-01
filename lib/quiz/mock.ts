import type { Difficulty, QuestionType } from "@/lib/db/schema";
import type { GenerateBatchInput } from "@/lib/prompts/generate";
import { BLANK, type GeneratedQuestion, type GenerationOutput } from "./schemas";

/**
 * Deterministic fake output for MDQUIZ_LLM_MOCK=1. Questions quote real
 * sentences from the notes so they pass the excerpt check like real ones.
 */
export function mockGeneration(input: GenerateBatchInput): GenerationOutput {
  const types = expand(input.types);
  const diffs = expand(input.difficulties);
  const questions: GeneratedQuestion[] = [];
  let slot = 0;
  for (const part of input.parts) {
    const sentences = sentencesOf(part.content);
    for (let i = 0; i < part.count; i++) {
      const sentence = sentences[i % Math.max(1, sentences.length)] ?? part.headingPath;
      const type = (types[slot] ?? "mcq") as QuestionType;
      const difficulty = (diffs[slot] ?? "medium") as Difficulty;
      slot++;
      const q = mockQuestion(part.ref, part.headingPath, sentence, type, difficulty, i);
      // The first question of a section with a figure shows it, like a real model would.
      const figure = i === 0 ? /!\[[^\]]*\]\(\s*<?([^)\s>]+)/.exec(part.content)?.[1] : undefined;
      questions.push({ ...q, image: figure ?? "" });
    }
  }
  return { title: `Quiz: ${input.parts[0]?.headingPath.split(" > ")[0] ?? "Notes"}`, questions };
}

function mockQuestion(
  ref: string,
  path: string,
  sentence: string,
  type: QuestionType,
  difficulty: Difficulty,
  i: number,
): GeneratedQuestion {
  const empty = { options: [], correctOptions: [], acceptedAnswers: [], referenceAnswer: "", rubric: [] };
  const base = {
    sectionRef: ref,
    concept: sentence.split(/\s+/).slice(0, 8).join(" "),
    image: "",
    type,
    difficulty,
    explanation: `The notes on ${path} state: ${sentence}`,
    excerpt: sentence,
  };
  const words = sentence.split(/\s+/);
  const keyword = words.reduce((a, b) => (b.replace(/\W/g, "").length > a.replace(/\W/g, "").length ? b : a), "");
  switch (type) {
    case "mcq":
      return {
        ...base,
        ...empty,
        prompt: `(${i + 1}) Which statement about **${path}** is correct?`,
        options: [sentence, `Distractor A for ${i + 1}`, `Distractor B for ${i + 1}`, `Distractor C for ${i + 1}`],
        correctOptions: [0],
      };
    case "multi":
      return {
        ...base,
        ...empty,
        prompt: `(${i + 1}) Select all that apply about **${path}**.`,
        options: [sentence, `Also true for ${i + 1}`, `Wrong option ${i + 1}`, `Another wrong option ${i + 1}`],
        correctOptions: [0, 1],
      };
    case "tf":
      return { ...base, ...empty, prompt: `(${i + 1}) True or false: ${sentence}`, options: ["True", "False"], correctOptions: [0] };
    case "short":
      return {
        ...base,
        ...empty,
        prompt: `(${i + 1}) Explain this idea from **${path}** in your own words.`,
        referenceAnswer: sentence,
        rubric: ["Restates the main idea", "Uses the key term correctly"],
      };
    case "blank":
      return {
        ...base,
        ...empty,
        prompt: `(${i + 1}) ${sentence.replace(keyword, BLANK)}`,
        acceptedAnswers: [keyword.replace(/[^\p{L}\p{N}'-]/gu, "")],
      };
  }
}

function sentencesOf(markdown: string): string[] {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .split("\n")
    .filter((l) => !/^\s*(#|\||!\[|---)/.test(l))
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 300 && !s.includes("$"));
}

function expand<K extends string>(counts: Partial<Record<K, number>>): K[] {
  return Object.entries(counts).flatMap(([k, n]) => Array.from({ length: n as number }, () => k as K));
}
