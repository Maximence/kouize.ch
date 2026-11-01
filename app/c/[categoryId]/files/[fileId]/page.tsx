import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MarkdownView } from "@/components/markdown-view";
import { ScrollToSection } from "@/components/scroll-to-section";
import { VersionSelect } from "@/components/version-select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { categoryImageUrls } from "@/lib/images";
import { getFileWithVersion } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Props = PageProps<"/c/[categoryId]/files/[fileId]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { fileId } = await props.params;
  const data = await getFileWithVersion(fileId);
  return { title: data?.file.name ?? "Fichier" };
}

export default function FilePage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <FileContent {...props} />
    </Suspense>
  );
}

async function FileContent(props: Props) {
  const { categoryId, fileId } = await props.params;
  const sp = await props.searchParams;
  const v = typeof sp.v === "string" ? Number(sp.v) : undefined;
  const sectionId = typeof sp.section === "string" ? sp.section : undefined;

  const data = await getFileWithVersion(fileId, Number.isFinite(v) ? v : undefined);
  if (!data || data.file.categoryId !== categoryId) notFound();
  const { file, version, versions, sections } = data;
  const target = sections.find((s) => s.id === sectionId);
  const latest = versions[0].version;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link
          href={`/c/${categoryId}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" /> Retour à la matière
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">{file.name}</h1>
          <VersionSelect versions={versions.map((x) => ({ version: x.version, date: formatDate(x.createdAt) }))} current={version.version} />
        </div>
        {version.version !== latest && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            Tu regardes la version {version.version}. La plus récente est la v{latest}.
          </p>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <nav className="hidden lg:block">
          <div className="sticky top-20 grid max-h-[calc(100vh-6rem)] gap-0.5 overflow-y-auto text-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sections</p>
            {sections.map((s) => (
              <a
                key={s.id}
                href={s.anchor ? `#${s.anchor}` : "#top"}
                className={cn(
                  "truncate rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                  s.level === 2 && "pl-5",
                  s.level === 3 && "pl-8",
                  s.id === target?.id && "bg-muted font-medium text-foreground",
                )}
              >
                {s.heading}
              </a>
            ))}
          </div>
        </nav>
        <article id="top" className="min-w-0">
          <MarkdownView source={version.content} images={categoryImageUrls(categoryId)} />
        </article>
      </div>
      {target && <ScrollToSection anchor={target.anchor} />}
    </div>
  );
}
