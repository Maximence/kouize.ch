"use client";

import { UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importQuiz } from "@/lib/actions/import";

export function ImportQuizButton({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="outline" onClick={() => input.current?.click()} disabled={pending}>
        <UploadIcon /> Importer
      </Button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="import-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          startTransition(async () => {
            const res = await importQuiz(categoryId, await file.text());
            if (!res.ok) return void toast.error(res.error);
            toast.success("Quiz importé");
            router.push(`/q/${res.data.quizId}`);
          });
        }}
      />
    </>
  );
}
