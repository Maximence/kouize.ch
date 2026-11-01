import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CategoryDialog } from "@/components/category-dialog";
import { ClassesHome } from "@/components/classes-home";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatScore, plural } from "@/lib/format";
import { listCategories } from "@/lib/queries";
import { isHosted } from "@/lib/settings";

export default function HomePage() {
  return (
    <Suspense fallback={<CategoryGridSkeleton />}>
      <Home />
    </Suspense>
  );
}

/** Online: the player's classes. On your computer: your studio. */
async function Home() {
  await connection();
  return isHosted() ? <ClassesHome /> : <StudioHome />;
}

function StudioHome() {
  return (
    <div className="grid gap-8">
      <section className="rounded-lg border bg-card px-6 py-8 sm:px-10 sm:py-10">
        <div className="grid gap-4 sm:max-w-2xl">
          <h1 className="text-4xl leading-tight sm:text-5xl">
            Transforme tes notes en <span className="kouize-highlight">quiz</span> que tu vas vraiment aimer.
          </h1>
          <p className="text-muted-foreground">
            Dépose tes notes de cours, obtiens des questions tirées uniquement de celles-ci, et vois exactement quoi réviser.
          </p>
          <div className="flex flex-wrap gap-2">
            <CategoryDialog
              trigger={
                <Button size="lg" className="px-5 font-semibold">
                  <PlusIcon /> Nouvelle matière
                </Button>
              }
            />
            <Button size="lg" variant="outline" className="px-5 font-semibold" asChild>
              <Link href="/review">Révision du jour</Link>
            </Button>
          </div>
        </div>
      </section>
      <h2 className="text-2xl font-semibold">Tes matières</h2>
      <Suspense fallback={<CategoryGridSkeleton />}>
        <CategoryGrid />
      </Suspense>
    </div>
  );
}

async function CategoryGrid() {
  const cats = await listCategories();
  if (!cats.length) {
    return (
      <Card className="border-dashed bg-card/60">
        <CardContent className="grid place-items-center gap-3 py-12 text-center">
          <div className="text-5xl">📚</div>
          <p className="font-heading text-lg">Pas encore de matière</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crée une matière par cours, puis dépose-y tes notes <code>.md</code>. Essaie les fichiers de{" "}
            <code>samples/</code> pour commencer.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cats.map((c) => (
        <Link key={c.id} href={`/c/${c.id}`} className="group" data-testid="category-card">
          <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-start gap-3 text-lg">
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-md text-2xl"
                  style={{ backgroundColor: `${c.color}66` }}
                >
                  {c.emoji}
                </span>
                <span className="break-words">{c.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Stat label="Fichiers" value={plural(c.fileCount, "fichier")} />
                <Stat label="Quiz" value={plural(c.quizCount, "quiz", "quiz")} />
                <Stat label="Score moyen" value={formatScore(c.avgScore)} />
                <Stat label="Dernière révision" value={formatDate(c.lastStudied)} />
              </dl>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function CategoryGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 rounded-lg" />
      ))}
    </div>
  );
}
