import Link from "next/link";
import { Suspense } from "react";
import { ReviewSession } from "@/components/review-session";
import { Skeleton } from "@/components/ui/skeleton";
import { INTERVAL_DAYS } from "@/lib/srs/leitner";
import { dueReviewCards, reviewSummary } from "@/lib/study";
import { cn } from "@/lib/utils";

export const metadata = { title: "Révision" };

export default function ReviewPage(props: PageProps<"/review">) {
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Révision du jour</h1>
        <p className="text-sm text-muted-foreground">
          Les questions déjà vues reviennent selon la méthode Leitner : après{" "}
          {Object.values(INTERVAL_DAYS).join(", ")} jours quand tu les réussis, et dès demain quand tu les rates.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-80 rounded-lg" />}>
        <ReviewContent {...props} />
      </Suspense>
    </div>
  );
}

async function ReviewContent(props: PageProps<"/review">) {
  const { subject } = await props.searchParams;
  const categoryId = typeof subject === "string" ? subject : undefined;
  const summary = await reviewSummary();
  const cards = await dueReviewCards(categoryId);
  const totalDue = summary.reduce((a, s) => a + s.due, 0);

  return (
    <div className="grid gap-4">
      {summary.length > 1 && (
        <div className="flex flex-wrap gap-1.5 text-sm">
          <FilterLink href="/review" active={!categoryId} label={`Toutes · ${totalDue}`} />
          {summary.map((s) => (
            <FilterLink
              key={s.categoryId}
              href={`/review?subject=${s.categoryId}`}
              active={categoryId === s.categoryId}
              label={`${s.emoji} ${s.name} · ${s.due}`}
            />
          ))}
        </div>
      )}
      {/* key: restart the session when the subject filter changes */}
      <ReviewSession key={categoryId ?? "all"} cards={cards} />
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md border px-3 py-1 text-muted-foreground hover:bg-muted",
        active && "border-foreground bg-muted font-medium text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
