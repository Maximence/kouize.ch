import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminPassword, isAdmin } from "@/lib/auth/session";
import { isHosted } from "@/lib/settings";

export const metadata = { title: "Admin" };

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await connection();
  if (!isHosted()) notFound();
  if (await isAdmin()) redirect("/admin");
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Admin</CardTitle>
        <CardDescription>
          {adminPassword()
            ? "Pour l'enseignant : gérer les classes, les quiz et les joueurs."
            : "La connexion admin est désactivée. Définis KOUIZE_ADMIN_PASSWORD sur le serveur, puis redémarre-le."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AdminLoginForm />
      </CardContent>
    </Card>
  );
}
