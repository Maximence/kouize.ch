import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { JoinForm } from "@/components/join-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentUser } from "@/lib/auth/session";
import { isHosted } from "@/lib/settings";

export const metadata = { title: "Rejoindre une classe" };

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinContent />
    </Suspense>
  );
}

async function JoinContent() {
  await connection();
  if (!isHosted()) notFound();
  const user = await currentUser();
  if (!user) redirect("/login?next=/join");
  return (
    <div className="mx-auto grid w-full max-w-md gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Rejoindre une classe</CardTitle>
          <CardDescription>
            Demande à ton enseignant le code et le mot de passe de la classe. Pour la classe privée d&apos;un ami, utilise l&apos;invitation
            reçue par e-mail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JoinForm defaultName={user.name} />
        </CardContent>
      </Card>
    </div>
  );
}
