import type { AnswerResponse, QuestionAnswer } from "@/lib/db/schema";

/** Human-readable correct answer, used in results and feedback prompts. */
export function correctAnswerText(q: { options: string[]; answer: QuestionAnswer }, trueFalse = ["True", "False"]): string {
  const a = q.answer;
  switch (a.type) {
    case "mcq":
      return q.options[a.correct] ?? "";
    case "multi":
      return a.correct.map((i) => q.options[i]).join("; ");
    case "tf":
      return a.correct ? (q.options[0] ?? trueFalse[0]) : (q.options[1] ?? trueFalse[1]);
    case "short":
      return a.reference;
    case "blank":
      return a.accepted.join(" / ");
  }
}

export function responseText(q: { options: string[] }, r: AnswerResponse | null | undefined): string {
  if (!r) return "";
  switch (r.type) {
    case "mcq":
      return r.choice == null ? "" : (q.options[r.choice] ?? "");
    case "multi":
      return r.choices.map((i) => q.options[i]).join("; ");
    case "tf":
      return r.choice == null ? "" : r.choice ? (q.options[0] ?? "True") : (q.options[1] ?? "False");
    case "short":
    case "blank":
      return r.text;
  }
}
