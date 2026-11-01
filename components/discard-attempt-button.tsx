"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteAttempt } from "@/lib/actions/attempts";

export function DiscardAttemptButton({ attemptId }: { attemptId: string }) {
  return (
    <ConfirmDialog
      title="Abandonner cette tentative ?"
      description="Tes réponses à cette tentative seront supprimées."
      confirmLabel="Abandonner"
      onConfirm={() => deleteAttempt(attemptId)}
      trigger={<Button variant="ghost">Abandonner</Button>}
    />
  );
}
