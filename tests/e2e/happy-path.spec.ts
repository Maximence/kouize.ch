import path from "node:path";
import { expect, test } from "@playwright/test";

// Runs with MDQUIZ_LLM_MOCK=1: generation, grading and feedback are deterministic and offline.
test("create subject → upload notes → generate quiz → take it → see results", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Nouvelle matière" }).click();
  await page.getByLabel("Nom", { exact: true }).fill("Algorithms");
  await page.getByRole("button", { name: "Créer la matière" }).click();
  await expect(page).toHaveURL(/\/c\//);

  await page.getByTestId("file-input").setInputFiles(path.join(__dirname, "../../samples/sorting-algorithms.md"));
  await expect(page.getByText("sorting-algorithms.md : ajouté")).toBeVisible();
  await expect(page.getByRole("link", { name: /sorting-algorithms\.md/ })).toBeVisible();

  await page.getByRole("tab", { name: "Quiz" }).click();
  await page.getByRole("link", { name: "Nouveau quiz" }).click();
  await page.getByRole("spinbutton", { name: "Nombre de questions" }).fill("5");
  await page.getByRole("button", { name: "Générer le quiz" }).click();

  await expect(page).toHaveURL(/\/q\//, { timeout: 30_000 });
  await expect(page.getByTestId("quiz-title")).toBeVisible();
  await expect(page.getByText("5 questions", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Entraînement", exact: true }).click();
  await expect(page).toHaveURL(/\/attempts\/[^/]+$/);

  for (let i = 1; i <= 5; i++) {
    await expect(page.getByTestId("progress-label")).toHaveText(`${i} / 5`);
    if (await page.getByTestId("option").count()) {
      await page.keyboard.press("1");
    } else if (await page.getByLabel("Ta réponse").count()) {
      await page.getByLabel("Ta réponse").fill("Merge sort splits the list in two halves.");
    } else {
      await page.getByLabel("Mot manquant").fill("sort");
    }
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expect(page.getByTestId("reveal")).toBeVisible();
    await page.getByRole("button", { name: i < 5 ? "Suivante" : "Voir les résultats", exact: true }).click();
  }

  await expect(page).toHaveURL(/\/results$/);
  await expect(page.locator("[data-testid=score]:visible")).toHaveText(/\d+%/);
  await expect(page.getByTestId("feedback")).toContainText(/feedback/i, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: /Ouvrir dans les notes/ }).first()).toBeVisible();

  // Source link opens the rendered note.
  await page.getByRole("link", { name: /Ouvrir dans les notes/ }).first().click();
  await expect(page).toHaveURL(/\/files\/.+section=/);
  await expect(page.locator("article h1")).toHaveText("Sorting Algorithms");
});
