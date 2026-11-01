import Link from "next/link";
import { cn } from "@/lib/utils";

type Filter = "all" | "wrong" | "flagged";

export function ResultsFilter({ current, counts }: { current: Filter; counts: Record<Filter, number> }) {
  const items: { key: Filter; label: string }[] = [
    { key: "all", label: "Toutes" },
    { key: "wrong", label: "Erreurs" },
    { key: "flagged", label: "Marquées" },
  ];
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.key === "all" ? "?" : `?show=${it.key}`}
          scroll={false}
          replace
          className={cn(
            "rounded-md px-2.5 py-1 text-muted-foreground",
            current === it.key && "bg-background font-medium text-foreground shadow-sm",
          )}
        >
          {it.label} <span className="tabular-nums opacity-70">{counts[it.key]}</span>
        </Link>
      ))}
    </div>
  );
}
