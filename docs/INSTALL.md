# Installing and hosting KOUIZE

Technical notes: running the studio, putting the online copy on a host, email invitations and the code layout. For what KOUIZE does and how to use the website, see the [README](../README.md).

The interface is in French; these notes are in English, like the code.

## Setup

Requires Node.js 20+.

```bash
npm install
npm run db:migrate              # creates data/mdquiz.db
npm run dev                     # http://localhost:3000
```

Then open **Settings** and pick the AI that writes your quizzes. No files to edit:

| Option | What you need | Cost |
|---|---|---|
| **Claude (Pro/Max subscription)** | [Claude Code](https://claude.com/code) installed, and logged in once with `claude` | Included in your plan (counts toward its usage limits) |
| **ChatGPT (Plus/Pro subscription)** *(experimental)* | [Codex CLI](https://github.com/openai/codex) (`npm i -g @openai/codex`) + `codex login` | Included in your plan |
| **Anthropic, OpenAI, Google Gemini, OpenRouter** | An API key pasted in Settings | Pay as you go (Gemini has a free tier) |
| **Ollama / LM Studio** | The app running locally with a model downloaded | Free, offline |
| **Any OpenAI-compatible API** (Mistral, Groq, DeepSeek, vLLM…) | Base URL + key | Depends on the provider |

Use **Load models** to pick a model and **Test** to check the setup before saving. API keys are stored only in your local database: they are never sent to the browser and never included in backups. A key in `.env.local` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) also works as a fallback.

The app only listens on `127.0.0.1`, so other devices on your network can't use your keys or your subscription.

**Try it right away:** create a subject, then drop in the files from [`samples/`](../samples/): `audio-numerique.md` (French: sampling, Nyquist, quantization; math, a table, code) and `sorting-algorithms.md` (English: complexity table, code, math).

**No API key?** Start with `MDQUIZ_LLM_MOCK=1 npm run dev` to use deterministic fake questions, grading and feedback. The whole app works offline that way, which is handy for trying the UI.

### Try the online copy on your computer

`npm run dev` only reads `.env.local`, never `.env.production`, so it always starts the studio. To try the online side (accounts, classes, invitations) locally, pass the settings on the command line with a separate test database:

```bash
KOUIZE_HOSTED=1 MDQUIZ_DB_PATH=./data/try.db npm run db:migrate
KOUIZE_HOSTED=1 KOUIZE_ADMIN_PASSWORD=test MDQUIZ_DB_PATH=./data/try.db npm run dev -- -p 3001
```

Then open http://127.0.0.1:3001 (`/signup` for a student, `/admin` with the password `test`). Your studio keeps running on port 3000. Don't put `KOUIZE_HOSTED=1` in `.env.local`: it would switch the studio to online mode.

## Share with your class (Infomaniak or any Node.js host)

KOUIZE has two sides that run the same code:

- **The studio**, on your computer: subjects, notes, quiz generation (e.g. with your Claude subscription), editing. Nothing changes here.
- **The online copy**, for your students: classes, quizzes, XP, levels, badges and a leaderboard. **It never calls an AI and needs no API key.** Students create an account (name, email, password), then join your class with its code and password. They can also make classes of their own (see [Students' own classes](#students-own-classes)).

When you publish a quiz, the studio prepares it with your AI first (one cached call). It writes keywords for each short-answer key point and a study tip for each section. Online, short answers are graded by matching those keywords (ignoring case, accents and word endings), and the feedback is assembled from the tips. Keyword grading is rougher than an AI judge, so the Publish dialog lets you leave short-answer questions out.

### 1. Put the online copy on your host

The host must run Node.js (20.9+) and keep files on disk.

1. On your computer: `cp .env.production.example .env.production`, then set `KOUIZE_ADMIN_PASSWORD` to a long password (your login for `/admin`). Keep `KOUIZE_HOSTED=1`.
2. `npm run package:hosting` builds the app on your computer and creates `kouize-hosting.zip` (~14 MB). Your local data and `.env.local` are left out. The app is built here because shared hosting often stops a build partway (memory and time limits).
3. In the Infomaniak Manager, go to your Web hosting → **Add** → *project with advanced technologies* → **Node.js**. Pick a (sub)domain and a Node.js LTS version, then upload the zip (or send the files by SFTP).
4. In the site's Node.js settings:
   - **Execution folder:** the folder containing `package.json`
   - **Build command:** `npm install` (the app is already built). Tick **reinstall dependencies by deleting node_modules**.
   - **Start command:** `npm run start:hosted`. It creates or upgrades the database, then starts on the port Infomaniak provides in `PORT`.
5. Start the site and enable the SSL certificate. Then open `https://your-domain/api/health`: you should get `"ok": true` and `"hosted": true`.
6. **Persistence test:** note `firstSeen`, restart the site from the Manager, and reload `/api/health`. If `firstSeen` hasn't changed, the database survives restarts.

### 2. Create a class and connect your studio

1. Open `https://your-domain/admin`, log in, then click **New class**. For example: name "M55", code `m55`, and a password for your students.
2. Still in Admin, click **Create a publish token** and copy it. It's shown only once.
3. In your studio (`npm run dev` on your computer), go to **Settings → Online site**: paste the site address and the token, then click **Test connection**.

### 3. Publish quizzes

Open a quiz in the studio and click **Publish to class**. Publishing the same quiz again updates it online:

- Unchanged questions keep their results.
- Removed or edited questions disappear for new attempts, but old results and leaderboard points stay.
- **Unpublish** hides the quiz without deleting anyone's points.

The quiz page shows where the quiz is published, and warns you when you've edited it since.

### 4. Send students the link

Give students `https://your-domain/k/m55` and the class password. Each student creates an account (or logs in), picks the name shown on the leaderboard, and finds their progress on any device by logging in. Students who played before accounts existed get their progress back automatically when they sign up in the same browser, or with the recovery code from their old "Me" tab (on the **My account** page).

**How the leaderboard works:**
- Each answer earns 10, 20 or 30 XP (easy, medium, hard) times its score.
- Only a student's **best attempt on each quiz** counts, so retakes can raise a score but can't farm points.
- There's a weekly board (from Monday, Swiss time) and an all-time board.
- "I was right" and "Retry my mistakes" are turned off online, since they would change scores.

From **Admin** you can:
- add classes
- change a class password (students who already joined stay in)
- hide or delete quizzes
- rename or remove players
- import a quiz file exported from the studio

### Students' own classes

Any student with an account can click **New class** on their home page:

- **Private**: they invite people by email. Only invited people can join, and each invitation link works once, for 14 days.
- **Personal**: just for them, to play their own quizzes and track their XP.

The owner adds quizzes from the class's **Manage** tab. They can paste their AI's answer, or upload a `.json` file: either a KOUIZE export, or what ChatGPT/Claude/Gemini produced from the **Copy the prompt for your AI** button followed by their notes. The upload tolerates code fences and text around the JSON, and points to the exact question when something is wrong. As with your classes, short answers are graded by keywords, without any AI. The owner can also hide or delete quizzes, remove members, cancel invitations and handle "Suggest a fix" reports.

**Email:** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` in `.env.production` (your hosting's mailbox works) so invitations are emailed. Without them, the owner sees each invitation link to send themselves. Either way, invitations also appear on the invitee's home page once they log in with that email address.

You keep control from **Admin**: student classes are listed there with their owner, and you can hide or delete their quizzes and remove players. Your studio's publish token only reaches your own classes, never a student's.

### Email invitations with Infomaniak

Infomaniak has no SMTP page to fill in: create a mailbox in **Manager → Service Mail** (e.g. `kouize@your-domain.ch`) and use its address and password. In `.env.production`:

```
SMTP_HOST=mail.infomaniak.com
SMTP_PORT=465
SMTP_USER=kouize@your-domain.ch
SMTP_PASSWORD=the mailbox password
MAIL_FROM="KOUIZE <kouize@your-domain.ch>"
KOUIZE_PUBLIC_URL=https://your-domain.ch
```

- `SMTP_USER` is the full address. Use `SMTP_PORT=587` (STARTTLS) if 465 is blocked.
- `MAIL_FROM` must use the same address: Infomaniak only sends from the account you log in with.
- `.env.production` goes into the zip, so run `npm run package:hosting` again after changing it.
- When an email can't be sent, the server log says `Email not sent:` with the reason, and whoever invited gets the link to send themselves.

### Updating and backups

To update the online copy, run `npm run package:hosting` again, unpack the zip and upload its contents (with hidden files such as `.env.production` and `.next`) over the site folder, replacing files. Then rebuild and restart. Leftover files from older versions are harmless now that the server doesn't build. The `data/` folder on the server holds everything, so don't delete it. Download `data/mdquiz.db` by SFTP from time to time (stop the site first for a clean copy).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on port 3000 |
| `npm run db:migrate` | Create or upgrade `data/mdquiz.db` |
| `npm run db:generate` | Create a new migration after editing `lib/db/schema.ts` |
| `npm test` | Unit tests (parser, chunker, excerpt check, scoring, keyword grading, XP, levels, badges, shuffling, Leitner, export, passwords) |
| `npm run test:e2e` | Playwright happy path on a fresh database with the mock LLM (first run: `npx playwright install chromium`) |
| `npm run test:e2e:hosted` | Playwright test of a studio publishing to an online copy: admin, class password, student accounts, leaderboard, that a student can't see another's results, and student-made classes with quiz upload and email invitations |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint |

Set `E2E_REAL_LLM=1` to run the end-to-end test against the real API instead of the mock (this costs a few cents). Stop any running `npm run dev` first, because the e2e test builds and starts its own server.

## How it works

```
app/                 pages (Server Components) + route handlers
  api/generate       POST → NDJSON stream of generation progress
  api/attempts/…     written feedback for an attempt
  api/quizzes/…      export, api/backup: backup & restore
  api/publish/…      online copy: receives quizzes from your studio (token-checked)
  k/[code]/…         online: class home, leaderboard, quizzes; admin/: classes and players
lib/
  auth/              admin and student sessions, players (one per account), ownership and viewer checks
  game/              XP, levels, leaderboards, badges
  publish/           studio → online: prepare (AI, in the studio), send, receive
  db/                Drizzle schema + SQLite connection
  markdown/          parse.ts (sections), chunk.ts (allocation & batching), excerpt.ts (source check, dedup)
  llm.ts             the only module that calls a model: cache → provider (API / OpenAI-compatible / CLI) → Zod → one retry
  llm/               provider catalog, CLI runner (Claude Code, Codex), strict JSON Schema from Zod
  prompts/           generation, grading and feedback prompts
  quiz/              generation pipeline, scoring, grading, shuffling, export format, student uploads
  mail.ts            invitation emails over SMTP (optional)
  srs/               Leitner scheduling
  actions/           Server Actions for all mutations
components/          UI (shadcn/ui + Tailwind)
```

- Every provider is asked for JSON matching a schema generated from Zod: Anthropic structured outputs, OpenAI `json_schema` (falling back to JSON mode on servers that lack it), or the CLIs' own schema flags. The result is validated with Zod again on the server. Invalid output is retried once with the validation errors, then reported as a clear error.
- Missing key, invalid key, rate limits, network errors and API overload each produce a specific message in the UI.
- Imported quizzes and questions whose source file was deleted keep their excerpt but no longer link to the notes.
