import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => nanoid(12));
const createdAt = (name = "created_at") =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/** Owner of data created on your own computer, where there are no accounts. */
export const LOCAL_USER_ID = "local";

export const users = sqliteTable("users", {
  id: id(),
  /** Stored lowercase. */
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Online: the name shown to others (classes, leaderboards). */
  name: text("name").notNull().default(""),
  createdAt: createdAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the cookie token, so a leaked database can't be used to log in. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

export const categories = sqliteTable(
  "categories",
  {
  id: id(),
  /** users.id, or LOCAL_USER_ID. No foreign key: SQLite can't add one to an existing table. */
  userId: text("user_id").notNull().default(LOCAL_USER_ID),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  emoji: text("emoji").notNull().default("📘"),
  createdAt: createdAt(),
  },
  (t) => [index("categories_user").on(t.userId)],
);

export const files = sqliteTable(
  "files",
  {
    id: id(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("files_category_name").on(t.categoryId, t.name)],
);

export const fileVersions = sqliteTable(
  "file_versions",
  {
    id: id(),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("file_versions_file_version").on(t.fileId, t.version)],
);

export const sections = sqliteTable(
  "sections",
  {
    id: id(),
    fileVersionId: text("file_version_id")
      .notNull()
      .references(() => fileVersions.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull(),
    /** 0 = preamble (text before the first heading), 1–3 = heading depth */
    level: integer("level").notNull(),
    heading: text("heading").notNull(),
    headingPath: text("heading_path").notNull(),
    anchor: text("anchor").notNull(),
    content: text("content").notNull(),
    charLen: integer("char_len").notNull(),
  },
  (t) => [index("sections_version").on(t.fileVersionId)],
);

export type QuestionType = "mcq" | "multi" | "tf" | "short" | "blank";
export type Difficulty = "easy" | "medium" | "hard";

export type QuizSettings = {
  fileIds: string[];
  sectionIds: string[] | null;
  count: number;
  difficulty: Difficulty | "mixed";
  types: QuestionType[];
  language: "auto" | "fr" | "en";
  /** set for "retry my mistakes" quizzes */
  sourceAttemptId?: string;
};

export type QuizSubject = { name: string; emoji: string; color: string };

/** Studio-prepared study tips for a published quiz, keyed by section path. */
export type StudyTips = Record<string, string>;

export const quizzes = sqliteTable("quizzes", {
  id: id(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  settings: text("settings", { mode: "json" }).$type<QuizSettings>().notNull(),
  language: text("language").notNull().default("en"),
  status: text("status", { enum: ["generating", "ready", "failed"] })
    .notNull()
    .default("generating"),
  error: text("error"),
  /** Online only: the class this quiz was published to (no foreign key: added to an existing table). */
  classId: text("class_id"),
  /** Online only: the studio's quiz id, so publishing again updates this quiz. */
  sourceId: text("source_id"),
  /** Online only: unpublished quizzes stay for their attempts but aren't listed. */
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  studyTips: text("study_tips", { mode: "json" }).$type<StudyTips>(),
  /** Online only: the studio subject it came from, to group quizzes inside a class. */
  subject: text("subject", { mode: "json" }).$type<QuizSubject>(),
  /** Online only: the class member who uploaded it (players.id), or null when published from the studio. */
  uploadedBy: text("uploaded_by"),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type QuestionAnswer =
  | { type: "mcq"; correct: number }
  | { type: "multi"; correct: number[] }
  | { type: "tf"; correct: boolean }
  | { type: "short"; reference: string; rubric: string[]; keyPoints?: KeyPoint[] }
  | { type: "blank"; accepted: string[] };

/** Prepared before publishing so short answers can be graded online without an AI. */
export type KeyPoint = { point: string; keywords: string[] };

export const questions = sqliteTable(
  "questions",
  {
    id: id(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull(),
    type: text("type").$type<QuestionType>().notNull(),
    difficulty: text("difficulty").$type<Difficulty>().notNull(),
    prompt: text("prompt").notNull(),
    options: text("options", { mode: "json" }).$type<string[]>().notNull(),
    answer: text("answer", { mode: "json" }).$type<QuestionAnswer>().notNull(),
    explanation: text("explanation").notNull(),
    sectionId: text("section_id").references(() => sections.id, {
      onDelete: "set null",
    }),
    /** heading path copied at generation time so it survives source deletion */
    sectionPath: text("section_path").notNull().default(""),
    excerpt: text("excerpt").notNull(),
    /** A figure from the notes shown with the question (assets.id), or null. */
    imageId: text("image_id"),
    imageAlt: text("image_alt"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("questions_quiz").on(t.quizId)],
);

export type AttemptFeedback = {
  summary: string;
  weakSections: { sectionId: string | null; path: string }[];
};

export const attempts = sqliteTable(
  "attempts",
  {
    id: id(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["practice", "exam"] }).notNull(),
    timeLimitSec: integer("time_limit_sec"),
    questionOrder: text("question_order", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    /** questionId → display order of original option indices */
    optionOrders: text("option_orders", { mode: "json" })
      .$type<Record<string, number[]>>()
      .notNull(),
    currentIndex: integer("current_index").notNull().default(0),
    startedAt: createdAt("started_at"),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    elapsedMs: integer("elapsed_ms").notNull().default(0),
    score: real("score"),
    feedback: text("feedback", { mode: "json" }).$type<AttemptFeedback>(),
    /** Online: the player who took it. Null for attempts in your own studio. */
    playerId: text("player_id"),
  },
  (t) => [index("attempts_quiz").on(t.quizId), index("attempts_player").on(t.playerId)],
);

export type AnswerResponse =
  | { type: "mcq"; choice: number | null }
  | { type: "multi"; choices: number[] }
  | { type: "tf"; choice: boolean | null }
  | { type: "short"; text: string }
  | { type: "blank"; text: string };

export type Verdict = "correct" | "partial" | "incorrect";

export const answers = sqliteTable(
  "answers",
  {
    id: id(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    response: text("response", { mode: "json" }).$type<AnswerResponse>(),
    score: real("score"),
    verdict: text("verdict").$type<Verdict>(),
    /** LLM comment for short answers, or "overridden" marker */
    comment: text("comment"),
    flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
    answeredAt: integer("answered_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("answers_attempt_question").on(t.attemptId, t.questionId)],
);

export const reviewItems = sqliteTable("review_items", {
  questionId: text("question_id")
    .primaryKey()
    .references(() => questions.id, { onDelete: "cascade" }),
  box: integer("box").notNull().default(1),
  dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
  lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
  lapses: integer("lapses").notNull().default(0),
});

export const llmCache = sqliteTable("llm_cache", {
  key: text("key").primaryKey(),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  response: text("response", { mode: "json" }).notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdAt: createdAt(),
});

/** Server-wide values (e.g. the health check's timestamps). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Each user's AI provider, models and effort. */
export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** Each user's API keys. Kept apart from `user_settings` so backups never include them. */
export const userSecrets = sqliteTable(
  "user_secrets",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: createdAt("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// ---------- Classes (online copy) ----------

/**
 * - "open": made by the admin, joined with its code and password;
 * - "private": made by a student, joined by invitation only;
 * - "personal": made by a student, just for them.
 */
export type ClassKind = "open" | "private" | "personal";

export const classes = sqliteTable("classes", {
  id: id(),
  /** Lowercase, used in links (/k/m55). */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Hidden subject that holds the class's quizzes. */
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  kind: text("kind").$type<ClassKind>().notNull().default("open"),
  /** The student who made it (users.id), or null for the admin's classes. No foreign key: added to an existing table. */
  ownerId: text("owner_id"),
  createdAt: createdAt(),
});

/**
 * Someone who plays in classes. Each account has exactly one; players made
 * before accounts existed are tied to a browser cookie (or its recovery code)
 * until an account adopts them.
 */
export const players = sqliteTable(
  "players",
  {
    id: id(),
    /** SHA-256 of the recovery code stored in the browser cookie. */
    tokenHash: text("token_hash").notNull().unique(),
    /** The account it belongs to (users.id). No foreign key: added to an existing table. */
    userId: text("user_id"),
    createdAt: createdAt(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("players_user").on(t.userId)],
);

/** An email invitation to a private class. The link's token is the credential: only its hash is kept. */
export const classInvites = sqliteTable(
  "class_invites",
  {
    id: id(),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    /** Stored lowercase. */
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").notNull(),
    createdAt: createdAt(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("class_invites_email").on(t.email), uniqueIndex("class_invites_class_email").on(t.classId, t.email)],
);

export const classMembers = sqliteTable(
  "class_members",
  {
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    /** Normalized name, unique per class. */
    nameKey: text("name_key").notNull(),
    joinedAt: createdAt("joined_at"),
  },
  (t) => [primaryKey({ columns: [t.classId, t.playerId] }), uniqueIndex("class_members_name").on(t.classId, t.nameKey)],
);

export const playerBadges = sqliteTable(
  "player_badges",
  {
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    badge: text("badge").notNull(),
    /** The attempt that earned it, to announce it on that results page. */
    attemptId: text("attempt_id"),
    earnedAt: createdAt("earned_at"),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.classId, t.badge] })],
);

/** Studio side: where each local quiz was published. */
export const publications = sqliteTable(
  "publications",
  {
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    siteUrl: text("site_url").notNull(),
    classCode: text("class_code").notNull(),
    className: text("class_name").notNull().default(""),
    remoteQuizId: text("remote_quiz_id").notNull(),
    /** Hash of what was sent, to tell when the quiz changed since. */
    contentHash: text("content_hash").notNull(),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    publishedAt: createdAt("published_at"),
  },
  (t) => [primaryKey({ columns: [t.quizId, t.siteUrl, t.classCode] })],
);

// ---------- Images from the notes ----------

/** Image files, stored once by content (id = SHA-256), so a figure shared by quizzes is kept once. */
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  mime: text("mime").notNull(),
  data: blob("data", { mode: "buffer" }).$type<Buffer>().notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: createdAt(),
});

/** The images uploaded to a subject, by file name, so `![](figures/fig1.png)` in a note finds them. */
export const categoryImages = sqliteTable(
  "category_images",
  {
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** File name without folders, lowercase. */
    name: text("name").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.name] })],
);

// ---------- Students' suggestions (online copy) ----------

export type SuggestionKind = "wrong-answer" | "unclear" | "typo" | "other";

/** A student pointing out a problem with a question. You fix it in the studio and republish. */
export const suggestions = sqliteTable(
  "suggestions",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    kind: text("kind").$type<SuggestionKind>().notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: ["open", "done", "dismissed"] }).notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [index("suggestions_quiz").on(t.quizId)],
);
