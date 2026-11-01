// Badges a player can earn in a class. Pure: ./award.ts stores them.

export const BADGES = {
  first_quiz: { emoji: "🎯", name: "Premiers pas", description: "Termine ton premier quiz" },
  perfect: { emoji: "💯", name: "Parfait !", description: "Obtiens 100 % à un quiz" },
  sharpshooter: { emoji: "🏹", name: "Tireur d'élite", description: "Obtiens 100 % à 3 quiz différents" },
  five_quizzes: { emoji: "🔥", name: "Sur ta lancée", description: "Termine 5 quiz différents" },
  ten_quizzes: { emoji: "🚀", name: "Inarrêtable", description: "Termine 10 quiz différents" },
  comeback: { emoji: "📈", name: "Remontée", description: "Bats ton meilleur score à un quiz de 30 points" },
  completionist: { emoji: "🏆", name: "Collectionneur", description: "Termine tous les quiz de la classe" },
  pioneer: { emoji: "⚡", name: "Pionnier", description: "Sois le premier de la classe à terminer un quiz" },
} as const;

export type BadgeId = keyof typeof BADGES;
export const BADGE_IDS = Object.keys(BADGES) as BadgeId[];

export type BadgeInput = {
  /** The player's finished attempts in the class, including the current one. */
  attempts: { id: string; quizId: string; score: number; finishedAt: number }[];
  currentAttemptId: string;
  /** Quizzes currently listed in the class. */
  classQuizIds: string[];
  /** Nobody else in the class finished this quiz before. */
  firstToFinish: boolean;
};

export function badgesEarned(input: BadgeInput): BadgeId[] {
  const { attempts } = input;
  const current = attempts.find((a) => a.id === input.currentAttemptId);
  const played = new Set(attempts.map((a) => a.quizId));
  const perfectQuizzes = new Set(attempts.filter((a) => a.score >= 0.999).map((a) => a.quizId));
  const out: BadgeId[] = [];
  if (attempts.length) out.push("first_quiz");
  if (perfectQuizzes.size >= 1) out.push("perfect");
  if (perfectQuizzes.size >= 3) out.push("sharpshooter");
  if (played.size >= 5) out.push("five_quizzes");
  if (played.size >= 10) out.push("ten_quizzes");
  if (current) {
    const earlier = attempts.filter((a) => a.quizId === current.quizId && a.finishedAt < current.finishedAt);
    if (earlier.length && current.score - Math.max(...earlier.map((a) => a.score)) >= 0.3 - 1e-9) out.push("comeback");
    if (input.firstToFinish) out.push("pioneer");
  }
  if (input.classQuizIds.length >= 2 && input.classQuizIds.every((id) => played.has(id))) out.push("completionist");
  return out;
}
