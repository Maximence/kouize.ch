import { LogOutIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountName, ChangePasswordForm, RestoreForm } from "@/components/auth-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { logOut } from "@/lib/actions/account";
import { currentUser } from "@/lib/auth/session";
import { isHosted } from "@/lib/settings";

export const metadata = { title: "Mon compte" };

export default function AccountPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await connection();
  if (!isHosted()) notFound();
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-3xl">Mon compte</h1>
        <form action={logOut}>
          <Button variant="ghost" type="submit">
            <LogOutIcon /> Se déconnecter
          </Button>
        </form>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nom</CardTitle>
          <CardDescription>
            Utilisé quand tu rejoins ou crées une classe. Tu peux toujours changer ton nom dans chaque classe (son onglet « Moi »).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1">
          <AccountName name={user.name} />
          <p className="text-sm text-muted-foreground" data-testid="account-email">
            {user.email}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Tu jouais avant les comptes ?</CardTitle>
          <CardDescription>
            Entre le code de récupération de ton ancien onglet « Moi » pour ramener cette progression dans ce compte. Ça ne marche que
            tant que ce compte n&apos;a pas sa propre progression.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RestoreForm />
        </CardContent>
      </Card>
    </div>
  );
}
