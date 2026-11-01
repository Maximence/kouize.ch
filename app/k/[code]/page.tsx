import { AwardIcon, ListChecksIcon, PlusIcon, SettingsIcon, TrophyIcon, UserIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SuggestionActions } from "@/components/admin-class-actions";
import { BadgeGrid } from "@/components/badge-grid";
import { SubjectCards } from "@/components/class-quiz-cards";
import { JoinForm } from "@/components/join-form";
import { Leaderboard } from "@/components/leaderboard";
import { LevelBar } from "@/components/level-bar";
import { RenameMe } from "@/components/me-card";
import {
  AddQuizDialog,
  ClassSettingsForm,
  InviteForm,
  LeaveClassButton,
  OwnerQuizActions,
  PendingInviteActions,
  RemoveMemberButton,
  RevokeInviteButton,
} from "@/components/my-class-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { currentPlayer } from "@/lib/auth/player";
import { currentUser } from "@/lib/auth/session";
import {
  adminClassQuizzes,
  classByCode,
  classInviteList,
  classQuizzes,
  groupBySubject,
  memberAccounts,
  membership,
  pendingInvitesFor,
} from "@/lib/classes";
import { classes } from "@/lib/db/schema";
import { formatDate, plural } from "@/lib/format";
import { leaderboard, playerBadgeList, playerStanding } from "@/lib/game/queries";
import { aiPrompt } from "@/lib/quiz/upload";
import { isHosted } from "@/lib/settings";
import { SUGGESTION_KINDS, classSuggestions } from "@/lib/suggestions";

type Props = PageProps<"/k/[code]">;
type Cls = typeof classes.$inferSelect;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { code } = await props.params;
  await connection();
  return { title: (isHosted() && classByCode(code)?.name) || "Classe" };
}

export default function ClassPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <ClassContent {...props} />
    </Suspense>
  );
}

async function ClassContent(props: Props) {
  const { code } = await props.params;
  const { tab } = await props.searchParams;
  await connection();
  if (!isHosted()) notFound();
  const cls = classByCode(code);
  if (!cls || cls.archived) notFound();
  const user = await currentUser();
  const player = await currentPlayer();
  if (!user || !player) redirect(`/login?next=${encodeURIComponent(`/k/${cls.code}`)}`);
  const member = membership(player.id, cls.id);

  if (!member) {
    const invite = pendingInvitesFor(user.email, player.id).find((i) => i.classId === cls.id);
    return (
      <div className="mx-auto grid w-full max-w-md gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Rejoindre {cls.name}</CardTitle>
            <CardDescription>
              {cls.kind === "open"
                ? "Entre le mot de passe de la classe et choisis le nom que les autres verront dans le classement."
                : invite
                  ? `${invite.ownerName || "Quelqu'un"} t'invite dans cette classe.`
                  : "Cette classe est privée : il te faut une invitation de son propriétaire."}
            </CardDescription>
          </CardHeader>
          {(cls.kind === "open" || invite) && (
            <CardContent>
              {cls.kind === "open" ? <JoinForm code={cls.code} defaultName={user.name} /> : <PendingInviteActions inviteId={invite!.id} />}
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  const isOwner = cls.ownerId === user.id;
  const solo = cls.kind === "personal";
  const quizzes = classQuizzes(cls.id, player.id);
  const standing = playerStanding(player.id, cls.id);
  const badges = playerBadgeList(player.id, cls.id);
  const tabs = ["quizzes", ...(solo ? [] : ["leaderboard"]), "me", ...(isOwner ? ["manage"] : [])];

  return (
    <div className="grid gap-6" data-full-width>
      <div className="grid gap-4 sm:grid-cols-[1fr_minmax(16rem,22rem)] sm:items-end">
        <div className="min-w-0">
          <h1 className="text-3xl break-words sm:text-4xl">
            {cls.name}{" "}
            {cls.kind !== "open" && (
              <Badge variant="outline" className="align-middle">
                {solo ? "Personnelle" : "Privée"}
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {plural(quizzes.length, "quiz", "quiz")} · tu joues en tant que <span className="font-medium text-foreground">{member.displayName}</span>
          </p>
        </div>
        <Card className="py-4">
          <CardContent className="grid gap-2">
            <LevelBar xp={standing.xp} level={standing.level} />
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TrophyIcon className="size-4" />
              {solo
                ? `${standing.xp} XP`
                : standing.rank
                  ? `Rang ${standing.rank} sur ${standing.players}`
                  : "Joue un quiz pour entrer dans le classement"}
              <span className="ml-auto">{badges.length} 🏅</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={typeof tab === "string" && tabs.includes(tab) ? tab : "quizzes"}>
        <TabsList>
          <TabsTrigger value="quizzes">
            <ListChecksIcon /> Quiz
          </TabsTrigger>
          {!solo && (
            <TabsTrigger value="leaderboard">
              <TrophyIcon /> Classement
            </TabsTrigger>
          )}
          <TabsTrigger value="me">
            <UserIcon /> Moi
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger value="manage">
              <SettingsIcon /> Gérer
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="quizzes" className="grid gap-6 pt-2">
          <div className="flex justify-end">
            <AddQuizDialog
              classId={cls.id}
              prompt={aiPrompt()}
              trigger={
                <Button variant="outline">
                  <PlusIcon /> Ajouter un quiz
                </Button>
              }
            />
          </div>
          {!quizzes.length ? (
            <p className="py-10 text-center text-muted-foreground">Aucun quiz pour l&apos;instant. Ajoute le premier avec ton IA !</p>
          ) : (
            <SubjectCards code={cls.code} groups={groupBySubject(quizzes)} />
          )}
          {!isOwner && <MyUploads classId={cls.id} playerId={player.id} />}
        </TabsContent>

        {!solo && (
          <TabsContent value="leaderboard" className="pt-2">
            <Leaderboard week={leaderboard(cls.id, "week")} all={leaderboard(cls.id, "all")} me={player.id} />
            <p className="mt-3 text-xs text-muted-foreground">
              Les points viennent de ta meilleure tentative sur chaque quiz : les questions difficiles valent plus (10 / 20 / 30 XP).
            </p>
          </TabsContent>
        )}

        <TabsContent value="me" className="grid gap-6 pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ton nom dans cette classe</CardTitle>
            </CardHeader>
            <CardContent>
              <RenameMe classId={cls.id} name={member.displayName} />
            </CardContent>
          </Card>
          <section className="grid gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <AwardIcon className="size-5" /> Badges
            </h2>
            <BadgeGrid earned={badges} />
          </section>
          {!isOwner && (
            <div>
              <LeaveClassButton classId={cls.id} name={cls.name} />
            </div>
          )}
        </TabsContent>

        {isOwner && (
          <TabsContent value="manage" className="grid gap-8 pt-2">
            <Manage cls={cls} ownerPlayerId={player.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/** For members: the quizzes they added, to hide or delete. */
function MyUploads({ classId, playerId }: { classId: string; playerId: string }) {
  const rows = adminClassQuizzes(classId).filter((q) => q.uploadedBy === playerId);
  if (!rows.length) return null;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">Les quiz que tu as ajoutés</h2>
      <ul className="divide-y rounded-lg border bg-card">
        {rows.map((q) => (
          <li key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5" data-testid="my-upload">
            <span className="min-w-0 flex-1 break-words">
              <span className="font-medium">{q.title}</span>
              {q.hidden && (
                <Badge variant="outline" className="ml-2">
                  Masqué
                </Badge>
              )}
              <span className="block text-xs text-muted-foreground">
                {plural(q.questionCount, "question")} · {plural(q.attemptCount, "tentative")}
              </span>
            </span>
            <OwnerQuizActions classId={classId} quiz={q} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The owner's side: every quiz, invitations, members, suggestions, settings. */
function Manage({ cls, ownerPlayerId }: { cls: Cls; ownerPlayerId: string }) {
  const quizRows = adminClassQuizzes(cls.id);
  const members = memberAccounts(cls.id);
  const invites = classInviteList(cls.id);
  const ideas = classSuggestions(cls.id).slice(0, 50);
  return (
    <>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Quiz · {quizRows.length}</h2>
        {!quizRows.length ? (
          <p className="text-sm text-muted-foreground">Aucun pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {quizRows.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5" data-testid="owner-quiz">
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-medium">{q.title}</span>
                  {q.hidden && (
                    <Badge variant="outline" className="ml-2">
                      Masqué
                    </Badge>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {plural(q.questionCount, "question")} · {plural(q.attemptCount, "tentative")} · ajouté
                    {q.uploaderName ? ` par ${q.uploaderName}` : ""} le {formatDate(q.updatedAt)}
                  </span>
                </span>
                <OwnerQuizActions classId={cls.id} quiz={q} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {cls.kind === "private" && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Inviter des gens</h2>
          <InviteForm classId={cls.id} />
          {invites.length > 0 && (
            <ul className="divide-y rounded-lg border bg-card" data-testid="owner-invites">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {i.email}
                    <span className="block text-xs text-muted-foreground">
                      invité le {formatDate(i.createdAt)}
                      {i.expired ? " · expirée" : ""}
                    </span>
                  </span>
                  <RevokeInviteButton classId={cls.id} inviteId={i.id} email={i.email} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(cls.kind === "private" || members.length > 1) && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Membres · {members.length}</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {members.map((m) => (
              <li key={m.playerId} className="flex items-center gap-3 px-4 py-2" data-testid="owner-member">
                <span className="min-w-0 flex-1 truncate">
                  {m.name}
                  <span className="block text-xs text-muted-foreground">
                    {m.email ?? "sans compte"} · a rejoint le {formatDate(m.joinedAt)}
                  </span>
                </span>
                {m.playerId === ownerPlayerId ? (
                  <Badge variant="outline">Propriétaire</Badge>
                ) : (
                  <RemoveMemberButton classId={cls.id} member={m} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ideas.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Suggestions des membres</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {ideas.map((s) => (
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
          <p className="text-xs text-muted-foreground">Pour corriger une question, modifie ton fichier de quiz et renvoie-le comme nouveau quiz.</p>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Réglages</h2>
        <ClassSettingsForm cls={{ id: cls.id, name: cls.name, kind: cls.kind === "personal" ? "personal" : "private" }} />
      </section>
    </>
  );
}
