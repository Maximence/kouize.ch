import { and, eq, gt, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AcceptInviteButton } from "@/components/my-class-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentPlayer } from "@/lib/auth/player";
import { currentUser, hashToken } from "@/lib/auth/session";
import { membership } from "@/lib/classes";
import { db } from "@/lib/db";
import { classInvites, classes, users } from "@/lib/db/schema";
import { isHosted } from "@/lib/settings";

export const metadata = { title: "Invitation" };

type Props = PageProps<"/invite/[token]">;

export default function InvitePage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content(props: Props) {
  const { token } = await props.params;
  await connection();
  if (!isHosted()) notFound();
  const invite = db
    .select({ email: classInvites.email, className: classes.name, classId: classes.id, code: classes.code, ownerName: users.name })
    .from(classInvites)
    .innerJoin(classes, eq(classes.id, classInvites.classId))
    .leftJoin(users, eq(users.id, classes.ownerId))
    .where(
      and(
        eq(classInvites.tokenHash, hashToken(token)),
        isNull(classInvites.acceptedAt),
        eq(classes.archived, false),
        gt(classInvites.expiresAt, sql`(unixepoch() * 1000)`),
      ),
    )
    .get();
  const user = await currentUser();
  const player = await currentPlayer();
  if (invite && player && membership(player.id, invite.classId)) redirect(`/k/${invite.code}`);

  if (!invite) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Cette invitation n&apos;est plus valable</CardTitle>
          <CardDescription>Elle a expiré ou a déjà été utilisée. Demandes-en une nouvelle à la personne qui t&apos;a invité.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const next = `/invite/${token}`;
  const email = encodeURIComponent(invite.email);
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Rejoindre {invite.className}</CardTitle>
        <CardDescription>
          {invite.ownerName || "Quelqu&apos;un"} invite <span className="font-medium text-foreground">{invite.email}</span> à
          jouer aux quiz de cette classe et grimper dans son classement.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {user ? (
          <>
            <AcceptInviteButton token={token} />
            <p className="text-sm text-muted-foreground">
              Tu rejoindras en tant que <span className="font-medium text-foreground">{user.name}</span> ({user.email}).
            </p>
          </>
        ) : (
          <>
            <Button size="lg" className="font-semibold" asChild>
              <Link href={`/signup?next=${encodeURIComponent(next)}&email=${email}`}>Créer un compte</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={`/login?next=${encodeURIComponent(next)}&email=${email}`}>J&apos;ai déjà un compte</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
