import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdmin } from "@/lib/auth/session";
import { isHosted } from "@/lib/settings";

/** For admin pages: 404 on your own computer, login page when not signed in. */
export async function requireAdminPage() {
  await connection();
  if (!isHosted()) notFound();
  if (!(await isAdmin())) redirect("/admin/login");
}
