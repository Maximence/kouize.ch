import { eq } from "drizzle-orm";
import { ChevronLeftIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArchiveClassButton,
  ImportToClassButton,
  PlayerRowActions,
  QuizRowActions,
  SuggestionActions,
} from "@/components/admin-class-actions";
import { ClassDialog } from "@/components/admin-forms";
import { Leaderboard } from "@/components/leaderboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminPage } from "@/lib/admin";
import { adminClassQuizzes, classMemberList } from "@/lib/classes";
import { db } from "@/lib/db";
import { classes } from "@/lib/db/schema";
import { formatDate, plural } from "@/lib/format";
import { leaderboard } from "@/lib/game/queries";
import { SUGGESTION_KINDS, classSuggestions } from "@/lib/suggestions";

export const metadata = { title: "Classe · Admin" };

type Props = PageProps<"/admin/classes/[classId]">;

export default function AdminClassPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content(props: Props) {
  await requireAdminPage();
  const { classId } = await props.params;
  const cls = db.select().from(classes).where(eq(classes.id, classId)).get();
  if (!cls) notFound();
  const quizRows = adminClassQuizzes(cls.id);
  const members = classMemberList(cls.id);
  const all = leaderboard(cls.id, "all");
  const xpByPlayer = new Map(all.map((r) => [r.playerId, r.xp]));
  const ideas = classSuggestions(cls.id);
  const openIdeas = ideas.filter((s) => s.status === "open");

  return (
    <div className="grid gap-8" data-full-width>
      <div className="grid gap-3">
        <Link href="/admin" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-4" /> Admin
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl break-words">
              {cls.name} {cls.archived && <Badge variant="outline">Archivée</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {cls.kind === "open" ? (
                <>
                  Les élèves rejoignent sur <span className="font-mono text-foreground">/k/{cls.code}</span> avec le mot de passe de la classe.
                </>
              ) : (
                <>
                  Classe {cls.kind === "private" ? "privée" : "personnelle"} d&apos;un élève, sur <span className="font-mono text-foreground">/k/{cls.code}</span>. Son
                  propriétaire la gère ; tu peux toujours masquer ou supprimer des quiz et retirer des joueurs.
                </>
              )}
            </p>
          </div>
          <ClassDialog
            cls={{ id: cls.id, name: cls.name, code: cls.code }}
            trigger={
              <Button variant="outline">
                <PencilIcon /> Modifier
              </Button>
            }
          />
          <ArchiveClassButton classId={cls.id} archived={cls.archived} />
        </div>
      </div>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">Quiz</h2>
          <ImportToClassButton classId={cls.id} />
        </div>
        {!quizRows.length ? (
          <Card className="border-dashed bg-card/60">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Aucun quiz pour l&apos;instant. Dans ton studio, ouvre un quiz et clique sur <strong>Publier dans une classe</strong>.
            </CardContent>
          </Card>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {quizRows.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5" data-testid="admin-quiz">
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-medium">{q.title}</span>
                  {q.hidden && (
                    <Badge variant="outline" className="ml-2">
                      Masqué
                    </Badge>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {q.subject ? `${q.subject.emoji} ${q.subject.name} · ` : ""}
                    {plural(q.questionCount, "question")} · {plural(q.attemptCount, "tentative")} · mis à jour le {formatDate(q.updatedAt)}
                  </span>
                </span>
                <QuizRowActions quiz={q} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">
          Suggestions des élèves · {openIdeas.length} ouverte(s)
        </h2>
        {!ideas.length ? (
          <p className="text-sm text-muted-foreground">
            Aucune pour l&apos;instant. Les élèves peuvent suggérer une correction sur chaque question ; tu la verras ici et sur le quiz dans ton studio.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card" data-testid="admin-suggestions">
            {ideas.slice(0, 50).map((s) => (
              <li key={s.id} className={`flex flex-wrap items-start gap-3 px-4 py-3 ${s.status === "open" ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {s.quizTitle} · {SUGGESTION_KINDS[s.kind]} · {s.playerName} · {formatDate(s.createdAt)}
                    {s.status !== "open" && ` · ${s.status === "done" ? "traitée" : "ignorée"}`}
                  </p>
                  <p className="mt-1 line-clamp-2 font-medium">{s.questionPrompt}</p>
                  <p className="mt-1 whitespace-pre-wrap">“{s.message}”</p>
                </div>
                <SuggestionActions id={s.id} status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="grid content-start gap-3">
          <h2 className="text-lg font-semibold">Joueurs · {members.length}</h2>
          {!members.length ? (
            <p className="text-sm text-muted-foreground">Personne n&apos;a encore rejoint.</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {members.map((m) => (
                <li key={m.playerId} className="flex items-center gap-3 px-4 py-2" data-testid="admin-player">
                  <span className="min-w-0 flex-1 truncate">
                    {m.name}
                    <span className="block text-xs text-muted-foreground">a rejoint le {formatDate(m.joinedAt)}</span>
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">{xpByPlayer.get(m.playerId) ?? 0} XP</span>
                  <PlayerRowActions classId={cls.id} player={m} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <Card className="content-start">
          <CardHeader>
            <CardTitle className="text-lg">Classement</CardTitle>
          </CardHeader>
          <CardContent>
            <Leaderboard week={leaderboard(cls.id, "week")} all={all} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
