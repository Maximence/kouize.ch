import { eq } from "drizzle-orm";
import { ChevronLeftIcon, DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { formatBytes, readableNote } from "@/lib/notes";
import { isHosted } from "@/lib/settings";

type Props = PageProps<"/k/[code]/notes/[noteId]">;

export const metadata: Metadata = { title: "Notes" };

export default function NotePage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <Content {...props} />
    </Suspense>
  );
}

/** Read a notes file in the page: Markdown rendered, text as is, PDF in the browser's viewer. */
async function Content(props: Props) {
  const { code, noteId } = await props.params;
  await connection();
  if (!isHosted()) notFound();
  const found = await readableNote(noteId);
  if (!found || found.cls.code !== code) notFound();
  const { note, quiz, cls } = found;
  const src = `/api/notes/${note.id}`;
  const text =
    note.mime === "application/pdf"
      ? null
      : (db.select({ data: assets.data }).from(assets).where(eq(assets.id, note.assetId)).get()?.data.toString("utf8") ?? "");

  return (
    <div className="grid gap-4" data-full-width>
      <Link href={`/k/${cls.code}?tab=notes`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {cls.name} · Notes
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl break-all" data-testid="note-title">
            {note.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {quiz.subject ? `${quiz.subject.emoji} ${quiz.subject.name} · ` : ""}
            {quiz.title} · {formatBytes(note.bytes)} · le {formatDate(note.createdAt)}
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href={`${src}?download=1`}>
            <DownloadIcon /> Télécharger
          </a>
        </Button>
      </div>
      {note.mime === "application/pdf" ? (
        <iframe src={src} title={note.name} className="h-[80vh] w-full rounded-lg border bg-card" />
      ) : note.mime === "text/markdown" ? (
        <article className="rounded-lg border bg-card px-6 py-5" data-testid="note-content">
          <MarkdownView source={text ?? ""} />
        </article>
      ) : (
        <pre className="overflow-x-auto rounded-lg border bg-card px-6 py-5 text-sm whitespace-pre-wrap" data-testid="note-content">
          {text}
        </pre>
      )}
    </div>
  );
}
