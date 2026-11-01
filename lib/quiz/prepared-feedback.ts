/** Feedback without an AI: an opening line for the score, then the prepared tip of each weak section. */
export function preparedFeedback(language: "fr" | "en", score: number, weakPaths: string[], tips: Record<string, string>): string {
  const fr = language === "fr";
  const pct = Math.round(score * 100);
  const opening =
    pct >= 100
      ? fr ? "Score parfait, bravo ! 🎉" : "Perfect score, well done! 🎉"
      : pct >= 80
        ? fr ? `Très bien : ${pct} %. Encore un petit effort sur ces points :` : `Great job: ${pct}%. Just a few things to polish:`
        : pct >= 50
          ? fr ? `Bon début : ${pct} %. Voici quoi revoir :` : `Good start: ${pct}%. Here's what to review:`
          : fr ? `${pct} % cette fois : pas de panique, voici par où commencer :` : `${pct}% this time. No worries, here's where to start:`;
  const lines = weakPaths.slice(0, 5).map((path) => {
    const name = path.split(" > ").at(-1) || path;
    const tip = tips[path] ?? (fr ? "Relis cette partie et refais les questions manquées." : "Re-read this part and redo the questions you missed.");
    return `- **${name}**: ${tip}`;
  });
  const closing = pct < 100 ? (fr ? "\n\nRefais le quiz demain pour fixer ce que tu as appris." : "\n\nRetake the quiz tomorrow to make it stick.") : "";
  return [opening, lines.join("\n")].filter(Boolean).join("\n\n") + closing;
}
