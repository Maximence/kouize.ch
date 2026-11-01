"use client";

import { ChevronDownIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { retryNewQuestionsSettings, retrySameQuestions } from "@/lib/actions/retry";
import { streamGeneration } from "@/lib/generation-client";

export function RetryMistakesButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  const same = async () => {
    setStatus("Création du quiz…");
    const res = await retrySameQuestions(attemptId);
    if (!res.ok) {
      setStatus(null);
      return void toast.error(res.error);
    }
    router.push(`/q/${res.data.quizId}`);
  };

  const fresh = async () => {
    setStatus("Préparation…");
    const res = await retryNewQuestionsSettings(attemptId);
    if (!res.ok) {
      setStatus(null);
      return void toast.error(res.error);
    }
    let done = false;
    await streamGeneration(res.data, (e) => {
      if (e.type === "start") setStatus(`Génération de ${e.target} questions…`);
      if (e.type === "batch") setStatus(`Génération… étape ${e.index + 1}/${e.batches}`);
      if (e.type === "error") toast.error(e.message);
      if (e.type === "done") {
        done = true;
        if (e.warning) toast.warning(e.warning);
        router.push(`/q/${e.quizId}`);
      }
    });
    if (!done) setStatus(null);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" disabled={status != null}>
          {status ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
          {status ?? "Refaire mes erreurs"}
          {!status && <ChevronDownIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={same}>Les mêmes questions (immédiat)</DropdownMenuItem>
        <DropdownMenuItem onSelect={fresh}>De nouvelles questions sur les mêmes sections</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
