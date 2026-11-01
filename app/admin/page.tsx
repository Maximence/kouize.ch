import { sql } from "drizzle-orm";
import { LogOutIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPasswordForm, ClassDialog, PublishTokenButton } from "@/components/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminLogout } from "@/lib/actions/admin";
import { requireAdminPage } from "@/lib/admin";
import { hasPublishToken } from "@/lib/classes";
import { db } from "@/lib/db";
import { classes } from "@/lib/db/schema";
import { plural } from "@/lib/format";

export const metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <AdminContent />
    </Suspense>
  );
}

async function AdminContent() {
  await requireAdminPage();
  const list = db
    .select({
      cls: classes,
      // The outer table is named explicitly: Drizzle writes a bare "id" in single-table selects.
      members: sql<number>`(SELECT count(*) FROM class_members m WHERE m.class_id = "classes"."id")`,
      quizzes: sql<number>`(SELECT count(*) FROM quizzes z WHERE z.class_id = "classes"."id" AND z.hidden = 0)`,
      ownerEmail: sql<string | null>`(SELECT u.email FROM users u WHERE u.id = "classes"."owner_id")`,
    })
    .from(classes)
    .orderBy(classes.archived, classes.name)
    .all();

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-3xl">Admin</h1>
        <ClassDialog
          trigger={
            <Button>
              <PlusIcon /> Nouvelle classe
            </Button>
          }
        />
        <form action={adminLogout}>
          <Button variant="ghost" type="submit">
            <LogOutIcon /> Se déconnecter
          </Button>
        </form>
      </div>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Classes</h2>
        {!list.length ? (
          <Card className="border-dashed bg-card/60">
            <CardContent className="py-10 text-center text-muted-foreground">
              Pas encore de classe. Crées-en une (par ex. code <code>m55</code>), puis partage son lien et son mot de passe.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map(({ cls, members, quizzes: n, ownerEmail }) => (
              <Link key={cls.id} href={`/admin/classes/${cls.id}`} className="group" data-testid="admin-class">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-start gap-2 text-lg break-words">
                      <span className="flex-1">{cls.name}</span>
                      {cls.archived && <Badge variant="outline">Archivée</Badge>}
                      {cls.kind !== "open" && <Badge variant="outline">{cls.kind === "private" ? "Privée" : "Personnelle"}</Badge>}
                    </CardTitle>
                    <CardDescription className="font-mono break-all">
                      /k/{cls.code}
                      {ownerEmail && <span className="block font-sans">par {ownerEmail}</span>}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {plural(members, "joueur")} · {plural(n, "quiz", "quiz")}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publier depuis ton studio</CardTitle>
          <CardDescription>
            Les quiz sont faits sur ton ordinateur (avec ton abonnement Claude, par exemple) et publiés ici avec
            ce jeton. Rien n&apos;utilise d&apos;IA en ligne : aucune clé API n&apos;est nécessaire sur ce serveur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PublishTokenButton exists={hasPublishToken()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mot de passe admin</CardTitle>
          <CardDescription>
            Remplace celui de KOUIZE_ADMIN_PASSWORD. Les autres sessions admin sont déconnectées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
