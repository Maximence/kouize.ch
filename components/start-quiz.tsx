"use client";

import { GraduationCapIcon, PlayIcon, TimerIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { startAttempt } from "@/lib/actions/attempts";

export function StartQuizButtons({ quizId, compact }: { quizId: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(15);

  const start = (mode: "practice" | "exam") =>
    startTransition(async () => {
      const res = await startAttempt(quizId, mode, mode === "exam" && timed ? minutes : null);
      if (!res.ok) return void toast.error(res.error);
      router.push(`/attempts/${res.data.id}`);
    });

  return (
    <>
      <Button onClick={() => start("practice")} disabled={pending} size={compact ? "default" : "lg"}>
        <PlayIcon /> {compact ? "Rejouer" : "Entraînement"}
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={pending} size={compact ? "default" : "lg"}>
            <GraduationCapIcon /> {compact ? "Examen" : "Mode examen"}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mode examen</DialogTitle>
            <DialogDescription>Pas de correction avant l&apos;envoi. Tu peux marquer des questions et y revenir.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={timed} onCheckedChange={setTimed} />
              <TimerIcon className="size-4" /> Limite de temps
            </label>
            {timed && (
              <div className="flex items-center gap-2">
                <Label htmlFor="minutes" className="sr-only">
                  Minutes
                </Label>
                <Input
                  id="minutes"
                  type="number"
                  min={1}
                  max={300}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => start("exam")} disabled={pending}>
              Commencer l&apos;examen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
