import { LockIcon, MailIcon, PlusIcon, TrophyIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { LevelBar } from "@/components/level-bar";
import { NewClassDialog, PendingInviteActions } from "@/components/my-class-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentPlayer } from "@/lib/auth/player";
import { currentUser } from "@/lib/auth/session";
import { pendingInvitesFor, playerClasses } from "@/lib/classes";
import { playerStanding } from "@/lib/game/queries";

/** Online home: log in first, then your classes, the ones you're invited to, and making your own. */
export async function ClassesHome() {
  const user = await currentUser();
  const player = await currentPlayer();

  if (!user || !player) {
    return (
      <div className="mx-auto grid w-full max-w-md gap-6">
        <div className="grid gap-2 text-center">
          <h1 className="text-4xl leading-tight">
            Prêt pour un <span className="kouize-highlight">quiz</span> ?
          </h1>
          <p className="text-muted-foreground">
            Rejoins ta classe pour jouer à ses quiz, gagner des XP et grimper dans le classement. Ou crée ta propre classe avec des quiz
            faits par ton IA, et invite tes amis.
          </p>
        </div>
        <div className="grid gap-2">
          <Button size="lg" className="font-semibold" asChild>
            <Link href="/signup">Créer un compte</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Se connecter</Link>
          </Button>
        </div>
      </div>
    );
  }

  const mine = playerClasses(player.id);
  const invites = pendingInvitesFor(user.email, player.id);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-2">
        <h1 className="mr-auto text-3xl">Mes classes</h1>
        <NewClassDialog
          trigger={
            <Button>
              <PlusIcon /> Nouvelle classe
            </Button>
          }
        />
        <Button variant="outline" asChild>
          <Link href="/join">Rejoindre avec un code</Link>
        </Button>
      </div>

      {invites.length > 0 && (
        <section className="grid gap-2" data-testid="pending-invites">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MailIcon className="size-5" /> Invitations
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{i.className}</span>
                  <span className="block text-xs text-muted-foreground">de la part de {i.ownerName || "quelqu'un"}</span>
                </span>
                <PendingInviteActions inviteId={i.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!mine.length ? (
        <Card className="border-dashed bg-card/60">
          <CardContent className="grid place-items-center gap-2 py-12 text-center">
            <div className="text-5xl">🎓</div>
            <p className="font-heading text-lg">Pas encore de classe</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Rejoins la classe de ton enseignant avec son code et son mot de passe, ou crée la tienne et ajoute des quiz générés par
              ton IA.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map(({ cls, name }) => {
            const s = playerStanding(player.id, cls.id);
            return (
              <Link key={cls.id} href={`/k/${cls.code}`} className="group" data-testid="class-card">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-start gap-2 text-xl break-words">
                      <span className="flex-1">{cls.name}</span>
                      {cls.kind === "private" && (
                        <Badge variant="outline">
                          <LockIcon /> Privée
                        </Badge>
                      )}
                      {cls.kind === "personal" && (
                        <Badge variant="outline">
                          <UserIcon /> Personnelle
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {cls.ownerId === user.id ? "À toi · " : ""}
                      Tu joues en tant que <span className="font-medium text-foreground">{name}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <LevelBar xp={s.xp} level={s.level} compact />
                    {cls.kind !== "personal" && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <TrophyIcon className="size-4" />
                        {s.rank ? `Rang ${s.rank} sur ${s.players}` : "Pas encore classé : joue un quiz !"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
