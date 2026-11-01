import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GenerateForm } from "@/components/generate-form";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUserId } from "@/lib/auth/session";
import { activeModelLabel, llmProblem } from "@/lib/llm";
import { getCategory, listLatestSections } from "@/lib/queries";

export const metadata = { title: "Nouveau quiz" };

export default function NewQuizPage(props: PageProps<"/c/[categoryId]/quizzes/new">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <NewQuizContent {...props} />
    </Suspense>
  );
}

async function NewQuizContent(props: PageProps<"/c/[categoryId]/quizzes/new">) {
  const { categoryId } = await props.params;
  const category = await getCategory(categoryId);
  if (!category) notFound();
  const files = await listLatestSections(categoryId);
  const userId = await requireUserId();
  const problem = llmProblem(userId);
  const active = activeModelLabel(userId);

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={`/c/${categoryId}?tab=quizzes`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" /> {category.emoji} {category.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau quiz</h1>
      </div>
      {problem && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {problem}{" "}
          <Link href="/settings" className="font-medium underline">
            Ouvrir les Réglages
          </Link>
        </p>
      )}
      {files.length ? (
        <GenerateForm categoryId={categoryId} files={files} provider={active.provider} model={active.model} />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Envoie d&apos;abord un fichier Markdown dans cette matière.{" "}
          <Link href={`/c/${categoryId}`} className="underline">
            Aller aux fichiers
          </Link>
        </p>
      )}
    </div>
  );
}
