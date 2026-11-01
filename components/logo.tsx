import { cn } from "@/lib/utils";

/** KOUIZE wordmark: the slab display font in flat ink. */
export function Logo({ className }: { className?: string }) {
  return <span className={cn("kouize-wordmark text-2xl leading-none", className)}>KOUIZE</span>;
}
