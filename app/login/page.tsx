import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNext } from "@/lib/auth/email";
import { currentUser } from "@/lib/auth/session";
import { isHosted } from "@/lib/settings";

export const metadata = { title: "Connexion" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={null}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content(props: PageProps<"/login">) {
  const { next, email } = await props.searchParams;
  await connection();
  if (!isHosted()) notFound();
  const target = safeNext(next);
  if (await currentUser()) redirect(target);
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Connexion</CardTitle>
        <CardDescription>Tes classes, tes quiz et ta progression, sur tous tes appareils.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={target} email={typeof email === "string" ? email : undefined} />
      </CardContent>
    </Card>
  );
}
