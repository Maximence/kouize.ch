import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ClassQuizCards } from "@/components/class-quiz-cards";
import { Skeleton } from "@/components/ui/skeleton";
import { currentPlayer } from "@/lib/auth/player";
import { classByCode, classQuizzes, groupBySubject, membership } from "@/lib/classes";
import { plural } from "@/lib/format";
import { classAttemptXps } from "@/lib/game/queries";
import { bestAttempts } from "@/lib/game/xp";
import { isHosted } from "@/lib/settings";

type Props = PageProps<"/k/[code]/s/[subject]">;

export const metadata: Metadata = { title: "Quiz" };

export default function SubjectPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content(props: Props) {
  const { code, subject } = await props.params;
  await connection();
  if (!isHosted()) notFound();
  const cls = classByCode(code);
  const player = await currentPlayer();
  if (!cls || cls.archived || !player || !membership(player.id, cls.id)) notFound();
  const key = decodeURIComponent(subject);
  const group = groupBySubject(classQuizzes(cls.id, player.id)).find((g) => g.key === key);
  if (!group) notFound();
  const best = bestAttempts(classAttemptXps(cls.id).filter((r) => r.playerId === player.id)).get(player.id);
  const xpByQuiz = new Map([...(best ?? new Map())].map(([quizId, a]) => [quizId, a.xp]));

  return (
    <div className="grid gap-6" data-full-width>
      <div className="grid gap-3">
        <Link href={`/k/${cls.code}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-4" /> {cls.name}
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-md text-3xl" style={{ backgroundColor: `${group.color}66` }}>
            {group.emoji}
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl break-words">{group.name}</h1>
            <p className="text-sm text-muted-foreground">{plural(group.quizzes.length, "quiz", "quiz")}</p>
          </div>
        </div>
      </div>
      <ClassQuizCards code={cls.code} quizzes={group.quizzes} xpByQuiz={xpByQuiz} />
    </div>
  );
}
