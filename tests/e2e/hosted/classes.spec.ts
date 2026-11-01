import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Next keeps recently visited pages mounted but hidden, so locators only look at visible elements.
// Mock AI everywhere. The online copy itself never calls an AI (its guard would throw).
const HOSTED = "http://127.0.0.1:3211";
const STUDIO = "http://127.0.0.1:3212";

/** Answer every question of a practice attempt; `pick` is the option key to press. */
async function playPractice(page: Page, pick: "1" | "2") {
  const total = Number((await page.getByTestId("progress-label").filter({ visible: true }).textContent())!.split("/")[1].trim());
  for (let i = 1; i <= total; i++) {
    await expect(page.getByTestId("progress-label").filter({ visible: true })).toHaveText(`${i} / ${total}`);
    if (await page.getByTestId("option").filter({ visible: true }).count()) {
      await page.keyboard.press(pick);
    } else if (await page.getByLabel("Ta réponse").filter({ visible: true }).count()) {
      await page.getByLabel("Ta réponse").filter({ visible: true }).fill(pick === "1" ? "Merge sort splits the list into halves and merges them." : "no idea");
    } else {
      await page.getByLabel("Mot manquant").filter({ visible: true }).fill(pick === "1" ? "sort" : "xyz");
    }
    await page.getByRole("button", { name: "Vérifier" }).filter({ visible: true }).click();
    await expect(page.getByTestId("reveal").filter({ visible: true })).toBeVisible();
    await page.getByRole("button", { name: i < total ? "Suivante" : "Voir les résultats", exact: true }).filter({ visible: true }).click();
  }
  await expect(page).toHaveURL(/\/results$/);
}

/** Class home → subject card → its first quiz. */
async function openQuiz(page: Page, subject: string) {
  await page.getByTestId("class-subject").filter({ visible: true }).filter({ hasText: subject }).click();
  await page.getByTestId("class-quiz").filter({ visible: true }).first().click();
}

/** Create an account from the page the browser is on (sign-up form or a page that links to it). */
async function signUp(page: Page, name: string, email: string) {
  if (!/\/signup/.test(page.url())) await page.getByRole("link", { name: "Créer un compte" }).filter({ visible: true }).first().click();
  await page.getByLabel("Ton nom").filter({ visible: true }).fill(name);
  await page.getByLabel("E-mail").filter({ visible: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).filter({ visible: true }).fill("correct-horse-42");
  await page.getByRole("button", { name: "Créer mon compte" }).filter({ visible: true }).click();
  await expect(page.getByTestId("account-link").filter({ visible: true })).toBeVisible();
}

async function leaderboardXp(page: Page) {
  await page.goto(`${HOSTED}/k/m55?tab=leaderboard`);
  const rows = page.getByRole("tabpanel").filter({ visible: true }).getByTestId("leaderboard-row");
  await expect(rows.first()).toBeVisible();
  const names = await page.getByRole("tabpanel").filter({ visible: true }).getByTestId("leaderboard-name").allTextContents();
  const xps = (await page.getByRole("tabpanel").filter({ visible: true }).getByTestId("leaderboard-xp").allTextContents()).map((t) => parseInt(t, 10));
  return names.map((n, i) => ({ name: n.replace("(toi)", "").trim(), xp: xps[i] }));
}

test("admin creates a class → studio publishes → students join, play and rank", async ({ browser }) => {
  // ---- Admin, online
  const admin = await (await browser.newContext()).newPage();
  await admin.goto(`${HOSTED}/admin`);
  await expect(admin).toHaveURL(/\/admin\/login$/);
  await admin.getByLabel("Mot de passe admin").filter({ visible: true }).fill("wrong");
  await admin.getByRole("button", { name: "Se connecter" }).filter({ visible: true }).click();
  await expect(admin.getByText("Mot de passe incorrect.").filter({ visible: true })).toBeVisible();
  await admin.getByLabel("Mot de passe admin").filter({ visible: true }).fill("admin-e2e");
  await admin.getByRole("button", { name: "Se connecter" }).filter({ visible: true }).click();
  await expect(admin).toHaveURL(/\/admin$/);

  await admin.getByRole("button", { name: "Nouvelle classe" }).filter({ visible: true }).click();
  await admin.getByLabel("Nom", { exact: true }).filter({ visible: true }).fill("M55 Signals");
  await admin.getByLabel("Code", { exact: true }).filter({ visible: true }).fill("m55");
  await admin.getByLabel("Mot de passe", { exact: true }).filter({ visible: true }).fill("pomme55");
  await admin.getByRole("button", { name: "Créer la classe" }).filter({ visible: true }).click();
  await expect(admin).toHaveURL(/\/admin\/classes\//);

  await admin.goto(`${HOSTED}/admin`);
  await admin.getByRole("button", { name: "Créer un jeton de publication" }).filter({ visible: true }).click();
  const token = (await admin.getByTestId("publish-token").filter({ visible: true }).textContent())!.trim();
  expect(token).toMatch(/^kzp_/);

  // ---- Studio, on "your computer"
  const studio = await (await browser.newContext({ baseURL: STUDIO })).newPage();
  await studio.goto("/settings");
  await studio.getByLabel("Adresse du site").filter({ visible: true }).fill(HOSTED);
  await studio.getByLabel("Jeton de publication").filter({ visible: true }).fill(token);
  await studio.getByRole("button", { name: "Tester la connexion" }).filter({ visible: true }).click();
  await expect(studio.getByText("Connecté : M55 Signals").filter({ visible: true })).toBeVisible();

  await studio.goto("/");
  await studio.getByRole("button", { name: "Nouvelle matière" }).filter({ visible: true }).click();
  await studio.getByLabel("Nom", { exact: true }).filter({ visible: true }).fill("Algorithms");
  await studio.getByRole("button", { name: "Créer la matière" }).filter({ visible: true }).click();
  await studio.getByTestId("file-input").setInputFiles(path.join(__dirname, "../../../samples/sorting-algorithms.md"));
  await expect(studio.getByText("sorting-algorithms.md : ajouté").filter({ visible: true })).toBeVisible();
  await studio.getByRole("tab", { name: "Quiz" }).filter({ visible: true }).click();
  await studio.getByRole("link", { name: "Nouveau quiz" }).filter({ visible: true }).click();
  await studio.getByRole("spinbutton", { name: "Nombre de questions" }).filter({ visible: true }).fill("5");
  await studio.getByRole("button", { name: "Générer le quiz" }).filter({ visible: true }).click();
  await expect(studio).toHaveURL(/\/q\//, { timeout: 30_000 });
  const studioQuizId = studio.url().split("/q/")[1];

  await studio.getByRole("button", { name: "Publier dans une classe" }).filter({ visible: true }).click();
  await expect(studio.getByRole("radio", { name: /M55 Signals/ }).filter({ visible: true })).toBeChecked();
  await studio.getByRole("button", { name: "Publier", exact: true }).filter({ visible: true }).click();
  await expect(studio.getByText("Publié !").filter({ visible: true })).toBeVisible({ timeout: 30_000 });
  await studio.reload();
  await expect(studio.getByTestId("publications").filter({ visible: true })).toContainText("M55 Signals");

  // A second subject whose notes have a figure: notes + image dropped together.
  await studio.goto("/");
  await studio.getByRole("button", { name: "Nouvelle matière" }).filter({ visible: true }).click();
  await studio.getByLabel("Nom", { exact: true }).filter({ visible: true }).fill("Signals");
  await studio.getByRole("button", { name: "Créer la matière" }).filter({ visible: true }).click();
  await studio.getByTestId("file-input").setInputFiles([
    path.join(__dirname, "../fixtures/spectrum.png"),
    path.join(__dirname, "../fixtures/spectrum-notes.md"),
  ]);
  await expect(studio.getByText("spectrum-notes.md : ajouté").filter({ visible: true })).toBeVisible();
  await expect(studio.getByAltText("spectrum.png").filter({ visible: true })).toBeVisible();
  await expect(studio.getByTestId("missing-images")).toHaveCount(0);
  await studio.getByRole("tab", { name: "Quiz" }).filter({ visible: true }).click();
  await studio.getByRole("link", { name: "Nouveau quiz" }).filter({ visible: true }).click();
  await studio.getByRole("spinbutton", { name: "Nombre de questions" }).filter({ visible: true }).fill("3");
  await studio.getByRole("button", { name: "Générer le quiz" }).filter({ visible: true }).click();
  await expect(studio).toHaveURL(/\/q\//, { timeout: 30_000 });
  await studio.getByRole("button", { name: "Publier dans une classe" }).filter({ visible: true }).click();
  await studio.getByRole("button", { name: "Publier", exact: true }).filter({ visible: true }).click();
  await expect(studio.getByText("Publié !").filter({ visible: true })).toBeVisible({ timeout: 30_000 });

  // ---- Alice needs an account first, then joins (wrong password first)
  const alice = await (await browser.newContext()).newPage();
  await alice.goto(`${HOSTED}/k/m55`);
  await expect(alice).toHaveURL(/\/login\?next=/);
  await signUp(alice, "Alice", "alice@example.com");
  await expect(alice).toHaveURL(/\/k\/m55$/);
  await alice.getByLabel("Mot de passe de la classe").filter({ visible: true }).fill("banane");
  await expect(alice.getByLabel("Ton nom").filter({ visible: true })).toHaveValue("Alice");
  await alice.getByRole("button", { name: "Rejoindre la classe" }).filter({ visible: true }).click();
  await expect(alice.getByTestId("join-error").filter({ visible: true })).toHaveText("Code de classe ou mot de passe incorrect.");
  await alice.getByLabel("Mot de passe de la classe").filter({ visible: true }).fill("pomme55");
  await alice.getByRole("button", { name: "Rejoindre la classe" }).filter({ visible: true }).click();
  await expect(alice.getByRole("heading", { name: "M55 Signals" }).filter({ visible: true })).toBeVisible();

  await openQuiz(alice, "Algorithms");
  await alice.getByRole("button", { name: "Entraînement", exact: true }).filter({ visible: true }).click();
  await playPractice(alice, "1");
  await expect(alice.getByTestId("xp-gained").filter({ visible: true })).toHaveText(/\+\d+ XP/);
  await expect(alice.getByTestId("new-badges").filter({ visible: true })).toContainText("Premiers pas");
  await expect(alice.getByTestId("feedback").filter({ visible: true })).toContainText(/Mock tip|Perfect score/, { timeout: 20_000 });
  // No "I was right" or "Retry my mistakes" online: they'd change the leaderboard.
  await expect(alice.getByRole("button", { name: /J'avais raison|marquer comme juste/ }).filter({ visible: true })).toHaveCount(0);
  await expect(alice.getByRole("button", { name: /Refaire/ }).filter({ visible: true })).toHaveCount(0);
  const aliceResults = alice.url();

  // Alice suggests a fix; it shows up in your studio, where you mark it done.
  await alice.getByRole("button", { name: "Suggérer une correction" }).filter({ visible: true }).first().click();
  await alice.getByLabel("Qu'est-ce qui devrait changer ?").filter({ visible: true }).fill("The notes say merge sort is stable.");
  await alice.getByRole("button", { name: "Envoyer" }).filter({ visible: true }).click();
  await expect(alice.getByText("Envoyé à ton enseignant. Merci !").filter({ visible: true })).toBeVisible();
  await studio.goto(`/q/${studioQuizId}`);
  const panel = studio.getByTestId("suggestions-panel").filter({ visible: true });
  await expect(panel).toContainText("The notes say merge sort is stable.");
  await expect(panel).toContainText("Alice (M55 Signals)");
  await panel.getByRole("button", { name: "Traité" }).click();
  await expect(panel).toHaveCount(0);

  // Subjects come first on the class page; the Signals quiz shows its figure.
  await alice.goto(`${HOSTED}/k/m55`);
  await expect(alice.getByTestId("class-subject").filter({ visible: true })).toHaveCount(2);
  await openQuiz(alice, "Signals");
  await alice.getByRole("link", { name: "Fiches" }).filter({ visible: true }).click();
  const figure = alice.locator("[data-testid=question-image] img").filter({ visible: true }).first();
  for (let i = 0; i < 3 && !(await figure.count()); i++) await alice.keyboard.press("ArrowRight");
  await expect(figure).toBeVisible();
  expect(await figure.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(64);

  // ---- Bob joins; the name Alice is taken
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await bob.goto(`${HOSTED}/signup`);
  await signUp(bob, "Bob", "bob@example.com");
  await bob.getByRole("link", { name: "Rejoindre avec un code" }).filter({ visible: true }).click();
  await bob.getByLabel("Code de la classe").filter({ visible: true }).fill("M55");
  await bob.getByLabel("Mot de passe de la classe").filter({ visible: true }).fill("pomme55");
  await bob.getByLabel("Ton nom").filter({ visible: true }).fill("alice");
  await bob.getByRole("button", { name: "Rejoindre la classe" }).filter({ visible: true }).click();
  await expect(bob.getByTestId("join-error").filter({ visible: true })).toContainText("déjà pris");
  await bob.getByLabel("Mot de passe de la classe").filter({ visible: true }).fill("pomme55");
  await bob.getByLabel("Ton nom").filter({ visible: true }).fill("Bob");
  await bob.getByRole("button", { name: "Rejoindre la classe" }).filter({ visible: true }).click();
  await expect(bob.getByRole("heading", { name: "M55 Signals" }).filter({ visible: true })).toBeVisible();
  await openQuiz(bob, "Algorithms");
  await bob.getByRole("button", { name: "Entraînement", exact: true }).filter({ visible: true }).click();
  await playPractice(bob, "2");

  // Bob can't open Alice's attempt. (The page streams, so the status is already 200: check what's shown.)
  await bob.goto(aliceResults);
  await expect(bob.getByText(/Page introuvable/).filter({ visible: true })).toBeVisible();
  await expect(bob.getByTestId("score")).toHaveCount(0);
  expect(await bob.content()).not.toContain("Merge sort splits");

  // ---- Leaderboard: both listed, sorted by XP
  const board = await leaderboardXp(alice);
  expect(board.map((r) => r.name).sort()).toEqual(["Alice", "Bob"]);
  expect(board[0].xp).toBeGreaterThanOrEqual(board[1].xp);
  let aliceXp = board.find((r) => r.name === "Alice")!.xp;

  // A retake with the same answers doesn't add points.
  await alice.goto(`${HOSTED}/k/m55`);
  await openQuiz(alice, "Algorithms");
  await alice.getByRole("button", { name: "Entraînement", exact: true }).filter({ visible: true }).click();
  await playPractice(alice, "1");
  // Options are reshuffled each attempt, so the score varies: only the best attempt counts, never the sum.
  const outcome = (await alice.getByTestId("outcome").filter({ visible: true }).textContent())!;
  const retakeXp = Number(/vaut (\d+) XP/.exec(outcome)![1]);
  const afterRetake = (await leaderboardXp(alice)).find((r) => r.name === "Alice")!.xp;
  expect(afterRetake).toBe(Math.max(aliceXp, retakeXp));
  aliceXp = afterRetake;

  // ---- Republish an edited quiz: Alice's old result and points stay
  const exported = await (await studio.request.get(`${STUDIO}/api/quizzes/${studioQuizId}/export`)).json();
  exported.questions[0].prompt = `${exported.questions[0].prompt} (edited)`;
  const pub = await studio.request.post(`${HOSTED}/api/publish`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { classCode: "m55", sourceId: studioQuizId, quiz: exported },
  });
  expect(pub.ok()).toBe(true);
  expect((await pub.json()).created).toBe(false);
  await alice.goto(aliceResults);
  await expect(alice.getByTestId("score").filter({ visible: true })).toHaveText(/\d+%/);
  expect((await leaderboardXp(alice)).find((r) => r.name === "Alice")!.xp).toBe(aliceXp);

  // A wrong token is refused.
  const bad = await studio.request.post(`${HOSTED}/api/publish`, {
    headers: { Authorization: "Bearer kzp_nope" },
    data: { classCode: "m55", sourceId: "x", quiz: exported },
  });
  expect(bad.status()).toBe(401);

  // ---- Bob logs in on another browser and finds his class (wrong password first)
  const bob2 = await (await browser.newContext()).newPage();
  await bob2.goto(`${HOSTED}/login`);
  await bob2.getByLabel("E-mail").filter({ visible: true }).fill("BOB@example.com");
  await bob2.getByLabel("Mot de passe", { exact: true }).filter({ visible: true }).fill("wrong-password");
  await bob2.getByRole("button", { name: "Se connecter" }).filter({ visible: true }).click();
  await expect(bob2.getByTestId("auth-error").filter({ visible: true })).toHaveText("E-mail ou mot de passe incorrect.");
  await bob2.getByLabel("Mot de passe", { exact: true }).filter({ visible: true }).fill("correct-horse-42");
  await bob2.getByRole("button", { name: "Se connecter" }).filter({ visible: true }).click();
  await expect(bob2.getByTestId("class-card").filter({ visible: true })).toContainText("Bob");

  // ---- Studio pages don't exist online
  expect((await alice.goto(`${HOSTED}/settings`))?.status()).toBe(404);
  expect((await alice.goto(`${HOSTED}/c/anything`))?.status()).toBe(404);
  expect((await alice.request.post(`${HOSTED}/api/generate`, { data: {} })).status()).toBe(404);

  // ---- Admin sees the players and can remove one
  await admin.goto(`${HOSTED}/admin`);
  await admin.getByTestId("admin-class").filter({ visible: true }).first().click();
  await expect(admin.getByTestId("admin-player").filter({ visible: true })).toHaveCount(2);
  await expect(admin.getByTestId("admin-suggestions").filter({ visible: true })).toContainText("merge sort is stable");
  await admin.getByRole("button", { name: "Retirer Bob" }).filter({ visible: true }).click();
  await admin.getByRole("button", { name: "Retirer", exact: true }).filter({ visible: true }).click();
  await expect(admin.getByTestId("admin-player").filter({ visible: true })).toHaveCount(1);
  expect((await leaderboardXp(alice)).map((r) => r.name)).toEqual(["Alice"]);

  // ---- The admin also plays with a student account in the same browser: their results count too
  await admin.goto(`${HOSTED}/k/m55`);
  await signUp(admin, "Prof", "prof@example.com");
  await admin.getByLabel("Mot de passe de la classe").filter({ visible: true }).fill("pomme55");
  await admin.getByLabel("Ton nom").filter({ visible: true }).fill("Prof");
  await admin.getByRole("button", { name: "Rejoindre la classe" }).filter({ visible: true }).click();
  await openQuiz(admin, "Algorithms");
  await admin.getByRole("button", { name: "Entraînement", exact: true }).filter({ visible: true }).click();
  await playPractice(admin, "1");
  await expect(admin.getByTestId("xp-gained").filter({ visible: true })).toHaveText(/\+\d+ XP/);
  expect((await leaderboardXp(admin)).map((r) => r.name).sort()).toEqual(["Alice", "Prof"]);
});

test("students make their own classes, add quizzes from their AI and invite friends by email", async ({ browser }) => {
  const quiz = {
    format: "mdquiz-quiz",
    version: 1,
    quiz: { title: "Cell biology", language: "en" },
    questions: [
      {
        type: "mcq",
        difficulty: "easy",
        prompt: "Where is DNA stored in a eukaryotic cell?",
        options: ["Nucleus", "Ribosome", "Cell wall", "Vacuole"],
        answer: { type: "mcq", correct: 0 },
        explanation: "The nucleus holds the DNA.",
      },
      {
        type: "tf",
        difficulty: "medium",
        prompt: "Mitochondria make ATP.",
        options: [],
        answer: { type: "tf", correct: true },
        explanation: "They are the cell's power plants.",
      },
    ],
  };

  // ---- Carol makes a private class and adds a quiz pasted from her AI (wrapped in its chatter)
  const carol = await (await browser.newContext()).newPage();
  await carol.goto(`${HOSTED}/signup`);
  await signUp(carol, "Carol", "carol@example.com");
  await carol.getByRole("button", { name: "Nouvelle classe" }).filter({ visible: true }).click();
  await carol.getByLabel("Nom", { exact: true }).filter({ visible: true }).fill("Bio study group");
  await carol.getByRole("radio", { name: "Privée" }).filter({ visible: true }).check();
  await carol.getByRole("button", { name: "Créer la classe" }).filter({ visible: true }).click();
  await expect(carol).toHaveURL(/\/k\/bio-study-group-[a-z0-9]{6}\?tab=manage$/);
  const classUrl = carol.url().replace("?tab=manage", "");
  await carol.goto(classUrl);
  await carol.getByRole("button", { name: "Ajouter un quiz" }).filter({ visible: true }).click();

  // No matière in the class yet: she creates one, and attaches the notes the quiz comes from.
  await expect(carol.getByLabel("1. Matière").filter({ visible: true })).toHaveValue("__new__");
  await carol.getByLabel("Nom de la nouvelle matière").filter({ visible: true }).fill("Biologie");
  await carol.getByRole("radio", { name: "🧬" }).filter({ visible: true }).click();
  await carol.getByTestId("upload-notes-input").setInputFiles({
    name: "cellule.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# La cellule\n\nLe **noyau** contient l'ADN."),
  });
  await expect(carol.getByTestId("picked-notes").filter({ visible: true })).toContainText("cellule.md");
  await carol.getByLabel("Ou colle la réponse de l'IA").filter({ visible: true }).fill("{ broken");
  await carol.getByRole("button", { name: "Ajouter le quiz" }).filter({ visible: true }).click();
  await expect(carol.getByText(/pas du JSON valide/).filter({ visible: true })).toBeVisible();
  await carol.getByLabel("Ou colle la réponse de l'IA").filter({ visible: true }).fill(`Here you go!\n\`\`\`json\n${JSON.stringify(quiz)}\n\`\`\``);
  await carol.getByRole("button", { name: "Ajouter le quiz" }).filter({ visible: true }).click();
  await expect(carol.getByText("Quiz ajouté à la classe").filter({ visible: true })).toBeVisible();
  await expect(carol.getByTestId("class-subject").filter({ visible: true })).toContainText("🧬");
  await expect(carol.getByTestId("class-subject").filter({ visible: true })).toContainText("Biologie");
  await carol.goto(`${classUrl}?tab=manage`);
  await expect(carol.getByTestId("owner-quiz").filter({ visible: true })).toContainText("Cell biology");

  // No email server in the test: the invitation link is shown to Carol instead.
  await carol.getByLabel("Adresses e-mail").filter({ visible: true }).fill("dave@example.com, not-an-email");
  await carol.getByRole("button", { name: "Inviter", exact: true }).filter({ visible: true }).click();
  await expect(carol.getByText(/« not-an-email » n'est pas une adresse e-mail/).filter({ visible: true })).toBeVisible();
  await carol.getByLabel("Adresses e-mail").filter({ visible: true }).fill("dave@example.com");
  await carol.getByRole("button", { name: "Inviter", exact: true }).filter({ visible: true }).click();
  const link = (await carol.getByTestId("invite-link").filter({ visible: true }).textContent())!.trim();
  expect(link).toMatch(/\/invite\/[\w-]{20,}$/);
  await expect(carol.getByTestId("owner-invites").filter({ visible: true })).toContainText("dave@example.com");

  // ---- Eve, not invited, can't get in
  const eve = await (await browser.newContext()).newPage();
  await eve.goto(`${HOSTED}/signup`);
  await signUp(eve, "Eve", "eve@example.com");
  await eve.goto(classUrl);
  await expect(eve.getByText("Cette classe est privée").filter({ visible: true })).toBeVisible();
  await expect(eve.getByTestId("pending-invites")).toHaveCount(0);

  // ---- Dave follows the link, creates his account with that email, and joins
  const dave = await (await browser.newContext()).newPage();
  await dave.goto(link);
  await expect(dave.getByText("Rejoindre Bio study group").filter({ visible: true })).toBeVisible();
  await dave.getByRole("link", { name: "Créer un compte" }).filter({ visible: true }).click();
  await expect(dave.getByLabel("E-mail").filter({ visible: true })).toHaveValue("dave@example.com");
  await signUp(dave, "Dave", "dave@example.com");
  await dave.getByRole("button", { name: "Rejoindre la classe" }).filter({ visible: true }).click();
  await expect(dave.getByRole("heading", { name: /Bio study group/ }).filter({ visible: true })).toBeVisible();
  await expect(dave.getByRole("tab", { name: "Gérer" })).toHaveCount(0);
  await openQuiz(dave, "Biologie");
  await dave.getByRole("button", { name: "Entraînement", exact: true }).filter({ visible: true }).click();
  await playPractice(dave, "1");
  await expect(dave.getByTestId("xp-gained").filter({ visible: true })).toHaveText(/\+\d+ XP/);

  // Any member can add a quiz too, then hide or delete it.
  await dave.goto(classUrl);
  await dave.getByRole("button", { name: "Ajouter un quiz" }).filter({ visible: true }).click();
  // The class's matières are offered first; Dave starts a new one.
  await expect(dave.getByLabel("1. Matière").filter({ visible: true })).toHaveValue("Biologie");
  await dave.getByLabel("1. Matière").filter({ visible: true }).selectOption("__new__");
  await dave.getByLabel("Nom de la nouvelle matière").filter({ visible: true }).fill("Génétique");
  await dave.getByLabel("Ou colle la réponse de l'IA").filter({ visible: true }).fill(JSON.stringify({ ...quiz, quiz: { title: "Dave's genetics", language: "fr" } }));
  // A file that only pretends to be a PDF is refused.
  await dave.getByTestId("upload-notes-input").setInputFiles({ name: "faux.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>nope</html>") });
  await dave.getByRole("button", { name: "Ajouter le quiz" }).filter({ visible: true }).click();
  await expect(dave.getByText(/faux\.pdf : seuls les fichiers PDF, TXT et MD/).filter({ visible: true })).toBeVisible();
  await dave.getByRole("button", { name: "Retirer faux.pdf" }).filter({ visible: true }).click();
  await dave.getByTestId("upload-notes-input").setInputFiles({ name: "adn.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  await dave.getByRole("button", { name: "Ajouter le quiz" }).filter({ visible: true }).click();
  await expect(dave.getByText("Quiz ajouté à la classe").filter({ visible: true })).toBeVisible();
  await expect(dave.getByTestId("class-subject").filter({ visible: true })).toHaveCount(2);
  await expect(dave.getByTestId("my-upload").filter({ visible: true })).toContainText("Dave's genetics");

  // ---- Notes tab: everyone's files, by matière then quiz, readable in the page
  await dave.goto(`${classUrl}?tab=notes`);
  const notes = dave.getByTestId("class-notes").filter({ visible: true });
  await expect(notes).toContainText("🧬 Biologie");
  await expect(notes).toContainText("cellule.md");
  await expect(notes).toContainText("par Carol");
  await expect(notes).toContainText("adn.pdf");
  await dave.getByRole("link", { name: "cellule.md" }).filter({ visible: true }).click();
  await expect(dave.getByTestId("note-title").filter({ visible: true })).toHaveText("cellule.md");
  await expect(dave.getByTestId("note-content").filter({ visible: true }).locator("strong")).toHaveText("noyau");
  const noteUrl = dave.url();
  const noteFile = noteUrl.replace(/\/k\/[^/]+\/notes\//, "/api/notes/");
  expect((await dave.request.get(noteFile)).status()).toBe(200);
  // Not for people outside the class.
  expect((await eve.request.get(noteFile)).status()).toBe(404);
  await eve.goto(noteUrl);
  await expect(eve.getByText("Page introuvable").filter({ visible: true })).toBeVisible();
  // Dave can delete his own notes, not Carol's.
  await dave.goto(`${classUrl}?tab=notes`);
  await expect(dave.getByRole("button", { name: "Supprimer cellule.md" })).toHaveCount(0);
  await expect(dave.getByRole("button", { name: "Supprimer adn.pdf" }).filter({ visible: true })).toBeVisible();
  await dave.goto(classUrl);
  await carol.goto(`${classUrl}?tab=manage`);
  await expect(carol.getByTestId("owner-quiz").filter({ visible: true }).filter({ hasText: "Dave's genetics" })).toContainText("ajouté par Dave");
  await dave.getByRole("button", { name: "Supprimer Dave's genetics" }).filter({ visible: true }).click();
  await dave.getByRole("button", { name: "Supprimer", exact: true }).filter({ visible: true }).click();
  await expect(dave.getByTestId("my-upload")).toHaveCount(0);

  // The link worked once: Eve can't reuse it.
  await eve.goto(link);
  await expect(eve.getByText("Cette invitation n'est plus valable").filter({ visible: true })).toBeVisible();

  // ---- Both rank on the class leaderboard; Carol sees Dave as a member
  await carol.goto(`${classUrl}?tab=leaderboard`);
  await expect(carol.getByRole("tabpanel").filter({ visible: true }).getByTestId("leaderboard-name").first()).toContainText("Dave");
  await carol.goto(`${classUrl}?tab=manage`);
  await expect(carol.getByTestId("owner-member").filter({ visible: true })).toHaveCount(2);
  await expect(carol.getByTestId("owner-invites")).toHaveCount(0);

  // ---- A personal class: no leaderboard, no invitations
  await carol.goto(`${HOSTED}/`);
  await carol.getByRole("button", { name: "Nouvelle classe" }).filter({ visible: true }).click();
  await carol.getByLabel("Nom", { exact: true }).filter({ visible: true }).fill("My revision");
  await carol.getByRole("radio", { name: "Personnelle" }).filter({ visible: true }).check();
  await carol.getByRole("button", { name: "Créer la classe" }).filter({ visible: true }).click();
  await expect(carol).toHaveURL(/\/k\/my-revision-/);
  await expect(carol.getByRole("tab", { name: "Classement" })).toHaveCount(0);
  await expect(carol.getByLabel("Adresses e-mail")).toHaveCount(0);
  await carol.goto(carol.url().replace("?tab=manage", ""));
  await carol.getByRole("button", { name: "Ajouter un quiz" }).filter({ visible: true }).click();
  await carol.getByLabel("Nom de la nouvelle matière").filter({ visible: true }).fill("Chimie");
  await carol.getByTestId("upload-quiz-input").setInputFiles({
    name: "quiz.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(quiz)),
  });
  await carol.getByRole("button", { name: "Ajouter le quiz" }).filter({ visible: true }).click();
  await expect(carol.getByText("Quiz ajouté à la classe").filter({ visible: true })).toBeVisible();
  await expect(carol.getByTestId("class-subject").filter({ visible: true })).toContainText("Chimie");
  await carol.goto(`${HOSTED}/`);
  await expect(carol.getByTestId("class-card").filter({ visible: true })).toHaveCount(2);

  // ---- Dave can't manage Carol's class, even by calling the page with ?tab=manage
  await dave.goto(`${classUrl}?tab=manage`);
  await expect(dave.getByLabel("Adresses e-mail")).toHaveCount(0);
  await expect(dave.getByTestId("owner-quiz")).toHaveCount(0);

  // ---- The admin sees and manages every class, students' included
  const admin = await (await browser.newContext()).newPage();
  await admin.goto(`${HOSTED}/admin/login`);
  await admin.getByLabel("Mot de passe admin").filter({ visible: true }).fill("admin-e2e");
  await admin.getByRole("button", { name: "Se connecter" }).filter({ visible: true }).click();
  await admin.getByTestId("admin-class").filter({ visible: true }).filter({ hasText: "Bio study group" }).click();
  await expect(admin.getByTestId("admin-notes").filter({ visible: true })).toContainText("cellule.md");
  await admin.getByTestId("admin-quiz").filter({ visible: true }).filter({ hasText: "Cell biology" }).getByRole("button", { name: "Supprimer le quiz" }).click();
  await admin.getByRole("button", { name: "Supprimer", exact: true }).filter({ visible: true }).click();
  await expect(admin.getByTestId("admin-quiz")).toHaveCount(0);
  await expect(admin.getByTestId("admin-notes")).toHaveCount(0);
  await admin.goto(`${HOSTED}/admin`);
  await admin.getByTestId("admin-class").filter({ visible: true }).filter({ hasText: "My revision" }).click();
  await admin.getByRole("button", { name: "Supprimer", exact: true }).filter({ visible: true }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  await expect(admin.getByTestId("admin-class").filter({ hasText: "My revision" })).toHaveCount(0);
  await carol.goto(`${HOSTED}/`);
  await expect(carol.getByTestId("class-card").filter({ visible: true })).toHaveCount(1);

  // ---- The admin changes their password: the old one stops working
  await admin.getByLabel("Mot de passe actuel").filter({ visible: true }).fill("admin-e2e");
  await admin.getByLabel("Nouveau mot de passe").filter({ visible: true }).fill("a-much-longer-secret");
  await admin.getByRole("button", { name: "Changer le mot de passe" }).filter({ visible: true }).click();
  await expect(admin.getByText("Mot de passe admin changé").filter({ visible: true })).toBeVisible();
  await admin.getByRole("button", { name: "Se déconnecter" }).filter({ visible: true }).click();
  await admin.goto(`${HOSTED}/admin/login`);
  await admin.getByLabel("Mot de passe admin").filter({ visible: true }).fill("admin-e2e");
  await admin.getByRole("button", { name: "Se connecter" }).filter({ visible: true }).click();
  await expect(admin.getByText("Mot de passe incorrect.").filter({ visible: true })).toBeVisible();
  await admin.getByLabel("Mot de passe admin").filter({ visible: true }).fill("a-much-longer-secret");
  await admin.getByRole("button", { name: "Se connecter" }).filter({ visible: true }).click();
  await expect(admin).toHaveURL(/\/admin$/);
});
