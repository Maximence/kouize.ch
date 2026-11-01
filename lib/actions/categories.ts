"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { fail, ok, type ActionResult } from "./result";

const CategoryInput = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide"),
  emoji: z.string().trim().min(1).max(8),
});

export async function createCategory(input: z.input<typeof CategoryInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = CategoryInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const userId = await requireUserId();
  const row = db.insert(categories).values({ ...parsed.data, userId }).returning({ id: categories.id }).get();
  refresh();
  return ok(row);
}

export async function updateCategory(id: string, input: z.input<typeof CategoryInput>): Promise<ActionResult> {
  const parsed = CategoryInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const userId = await requireUserId();
  db.update(categories).set(parsed.data).where(and(eq(categories.id, id), eq(categories.userId, userId))).run();
  refresh();
  return ok();
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId))).run();
  refresh();
  return ok();
}
