"use client";

import { CopyIcon, DownloadIcon, FileTextIcon, MoreHorizontalIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { deleteQuiz, duplicateQuiz, renameQuiz } from "@/lib/actions/quizzes";
import { streamGeneration } from "@/lib/generation-client";

export function QuizActions({ quiz }: { quiz: { id: string; title: string; categoryId: string } }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(quiz.title);
  const [deleting, setDeleting] = useState(false);
  const [regen, setRegen] = useState<{ done: number; total: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const regenerate = async () => {
    setRegen({ done: 0, total: 1 });
    let ok = false;
    await streamGeneration({ regenerateQuizId: quiz.id }, (e) => {
      if (e.type === "start") setRegen({ done: 0, total: e.batches });
      if (e.type === "batch") setRegen((r) => r && { ...r, done: r.done + 1 });
      if (e.type === "error") toast.error(e.message);
      if (e.type === "done") {
        ok = true;
        toast.success(`Nouvelle version générée : ${e.count} questions`);
        router.push(`/q/${e.quizId}`);
      }
    });
    if (!ok) setRegen(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Actions du quiz">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <PencilIcon /> Renommer
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              startTransition(async () => {
                const res = await duplicateQuiz(quiz.id);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Quiz dupliqué");
                router.push(`/q/${res.data.id}`);
              })
            }
            disabled={pending}
          >
            <CopyIcon /> Dupliquer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={regenerate} disabled={regen != null}>
            <RefreshCwIcon /> Régénérer (nouveau quiz, mêmes réglages)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={`/api/quizzes/${quiz.id}/export?format=json`} download>
              <DownloadIcon /> Exporter en JSON
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/quizzes/${quiz.id}/export?format=md`} download>
              <FileTextIcon /> Exporter en Markdown
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2Icon /> Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await renameQuiz(quiz.id, title);
                if (!res.ok) return void toast.error(res.error);
                setRenaming(false);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Renommer le quiz</DialogTitle>
            </DialogHeader>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus aria-label="Titre du quiz" />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={regen != null}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Régénération…</DialogTitle>
          </DialogHeader>
          <Progress value={regen ? (regen.done / Math.max(1, regen.total)) * 100 : 0} />
          <p className="text-sm text-muted-foreground">
            Un nouveau quiz est créé avec les mêmes réglages. Celui-ci est gardé avec ses tentatives.
          </p>
        </DialogContent>
      </Dialog>

      {deleting && (
        <ConfirmDialog
          title={`Supprimer « ${quiz.title} » ?`}
          description="Le quiz et toutes ses tentatives sont supprimés définitivement."
          onConfirm={async () => {
            await deleteQuiz(quiz.id);
            toast.success("Quiz supprimé");
            router.push(`/c/${quiz.categoryId}?tab=quizzes`);
          }}
          defaultOpen
          onOpenChange={(o) => !o && setDeleting(false)}
        />
      )}
    </>
  );
}
