import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNext } from "@/lib/auth/email";
import { currentUser } from "@/lib/auth/session";
import { isHosted } from "@/lib/settings";

export const metadata = { title: "Créer un compte" };

export default function SignUpPage(props: PageProps<"/signup">) {
  return (
    <Suspense fallback={null}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content(props: PageProps<"/signup">) {
  const { next, email } = await props.searchParams;
  await connection();
  if (!isHosted()) notFound();
  const target = safeNext(next);
  if (await currentUser()) redirect(target);
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Créer un compte</CardTitle>
        <CardDescription>
          Rejoins tes classes, crée les tiennes avec des quiz faits par ton IA, et invite tes amis. Si tu as déjà joué ici
          dans ce navigateur, ta progression te suit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm next={target} email={typeof email === "string" ? email : undefined} />
      </CardContent>
    </Card>
  );
}
