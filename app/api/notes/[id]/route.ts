import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { readableNote } from "@/lib/notes";

/** A notes file, for the admin and the members of its class. `?download=1` saves it instead of opening it. */
export async function GET(req: Request, ctx: RouteContext<"/api/notes/[id]">) {
  const { id } = await ctx.params;
  const found = await readableNote(id);
  const asset = found && db.select().from(assets).where(eq(assets.id, found.note.assetId)).get();
  if (!found || !asset) return new Response("Introuvable", { status: 404 });
  const pdf = found.note.mime === "application/pdf";
  const download = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(asset.data), {
    headers: {
      // Text and Markdown are shown as plain text: never interpreted as HTML.
      "Content-Type": pdf ? "application/pdf" : "text/plain; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(found.note.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Only this site may embed it. (A sandbox would also stop the browser's PDF viewer.)
      "Content-Security-Policy": pdf ? "frame-ancestors 'self'" : "default-src 'none'; frame-ancestors 'self'; sandbox",
    },
  });
}
