import "server-only";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { classMembers, classes, questions, quizzes, suggestions } from "@/lib/db/schema";

export const SUGGESTION_KINDS = {
  "wrong-answer": "La réponse est fausse",
  unclear: "La question n'est pas claire",
  typo: "Faute de frappe ou mise en forme",
  other: "Autre chose",
} as const;

export type SuggestionRow = {
  id: string;
  kind: keyof typeof SUGGESTION_KINDS;
  message: string;
  status: "open" | "done" | "dismissed";
  createdAt: Date;
  quizId: string;
  quizTitle: string;
  sourceId: string | null;
  className: string;
  questionPrompt: string;
  questionDeleted: boolean;
  playerName: string;
};

function list(where: SQL | undefined): SuggestionRow[] {
  return db
    .select({
      id: suggestions.id,
      kind: suggestions.kind,
      message: suggestions.message,
      status: suggestions.status,
      createdAt: suggestions.createdAt,
      quizId: quizzes.id,
      quizTitle: quizzes.title,
      sourceId: quizzes.sourceId,
      className: classes.name,
      questionPrompt: questions.prompt,
      deletedAt: questions.deletedAt,
      playerName: classMembers.displayName,
    })
    .from(suggestions)
    .innerJoin(questions, eq(questions.id, suggestions.questionId))
    .innerJoin(quizzes, eq(quizzes.id, suggestions.quizId))
    .innerJoin(classes, eq(classes.id, quizzes.classId))
    .leftJoin(classMembers, and(eq(classMembers.classId, classes.id), eq(classMembers.playerId, suggestions.playerId)))
    .where(where)
    .orderBy(desc(suggestions.createdAt))
    .all()
    .map(({ deletedAt, playerName, ...r }) => ({
      ...r,
      questionDeleted: Boolean(deletedAt),
      playerName: playerName ?? "Un ancien joueur",
    }));
}

export const classSuggestions = (classId: string) => list(eq(quizzes.classId, classId));

/** Open suggestions on the online copies of one studio quiz (all classes). */
export const openSuggestionsForSource = (sourceId: string) =>
  list(and(eq(quizzes.sourceId, sourceId), eq(suggestions.status, "open")));

export function setSuggestionStatus(ids: string[], status: "open" | "done" | "dismissed") {
  if (!ids.length) return;
  db.update(suggestions).set({ status }).where(inArray(suggestions.id, ids)).run();
}
