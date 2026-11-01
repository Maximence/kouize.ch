"use client";

import { usePathname, useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function VersionSelect({ versions, current }: { versions: { version: number; date: string }[]; current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  if (versions.length < 2) return null;
  return (
    <Select value={String(current)} onValueChange={(v) => router.push(`${pathname}?v=${v}`)}>
      <SelectTrigger className="w-44" aria-label="Version">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {versions.map((v, i) => (
          <SelectItem key={v.version} value={String(v.version)}>
            v{v.version} · {v.date}
            {i === 0 ? " (latest)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
