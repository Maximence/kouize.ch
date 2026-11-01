"use client";

import { CheckIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { overrideAnswer } from "@/lib/actions/attempts";

export function OverrideButton({ attemptId, questionId }: { attemptId: string; questionId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-fit"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await overrideAnswer(attemptId, questionId);
          if (res.ok) toast.success("Marquée comme juste");
          else toast.error(res.error);
        })
      }
    >
      <CheckIcon /> J&apos;avais raison, marquer comme juste
    </Button>
  );
}
