import { connection } from "next/server";
import { Suspense } from "react";
import { BackupCard } from "@/components/backup-card";
import { SettingsForm } from "@/components/settings-form";
import { SiteSettingsCard } from "@/components/site-settings-card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUserId } from "@/lib/auth/session";
import { isMockMode } from "@/lib/llm";
import { getSiteConfig } from "@/lib/publish/client";
import { getSettings, isHosted, publicProviderStates } from "@/lib/settings";

export const metadata = { title: "Réglages" };

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
      <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  await connection();
  const userId = await requireUserId();
  const site = getSiteConfig(userId);
  return (
    <div className="grid gap-6">
      <SettingsForm
        initial={getSettings(userId)}
        states={publicProviderStates(userId)}
        mock={isMockMode()}
        hosted={isHosted()}
      />
      {!isHosted() && <SiteSettingsCard url={site.url} hasToken={Boolean(site.token)} />}
      {!isHosted() && <BackupCard />}
    </div>
  );
}
