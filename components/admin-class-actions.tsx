"use client";

import { ArchiveIcon, ArchiveRestoreIcon, EyeIcon, EyeOffIcon, PencilIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importToClass, removePlayer, renamePlayer, setClassArchived, setQuizHidden } from "@/lib/actions/admin";
import { deleteQuiz } from "@/lib/actions/quizzes";
import type { ActionResult } from "@/lib/actions/result";
import { updateSuggestion } from "@/lib/actions/suggestions";

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, success?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else if (success) toast.success(success);
    });
  return [pending, run] as const;
}

export function ArchiveClassButton({ classId, archived }: { classId: string; archived: boolean }) {
  const [pending, run] = useAction();
  return (
    <Button variant="outline" disabled={pending} onClick={() => run(() => setClassArchived(classId, !archived))}>
      {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />} {archived ? "Désarchiver" : "Archiver"}
    </Button>
  );
}

export function QuizRowActions({ quiz }: { quiz: { id: string; title: string; hidden: boolean } }) {
  const [pending, run] = useAction();
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setQuizHidden(quiz.id, !quiz.hidden))}
        aria-label={quiz.hidden ? "Montrer aux élèves" : "Masquer aux élèves"}
      >
        {quiz.hidden ? <EyeIcon /> : <EyeOffIcon />} {quiz.hidden ? "Montrer" : "Masquer"}
      </Button>
      <ConfirmDialog
        title={`Supprimer « ${quiz.title} » ?`}
        description="Le quiz est supprimé avec toutes ses tentatives, ce qui retire aussi ses points du classement. Le masquer garde les points."
        onConfirm={() => run(() => deleteQuiz(quiz.id), "Quiz supprimé")}
        trigger={
          <Button variant="ghost" size="sm" aria-label="Supprimer le quiz">
            <Trash2Icon />
          </Button>
        }
      />
    </div>
  );
}

export function PlayerRowActions({ classId, player }: { classId: string; player: { playerId: string; name: string } }) {
  const [pending, run] = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  if (editing) {
    return (
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => renamePlayer(classId, player.playerId, name), "Renommé");
          setEditing(false);
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-40" maxLength={24} autoFocus />
        <Button size="sm" type="submit" disabled={pending}>
          Enregistrer
        </Button>
      </form>
    );
  }
  return (
    <div className="flex shrink-0 gap-1">
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`Renommer ${player.name}`}>
        <PencilIcon />
      </Button>
      <ConfirmDialog
        title={`Retirer ${player.name} ?`}
        description="Ses tentatives et badges dans cette classe sont supprimés. Il ou elle peut revenir avec le mot de passe de la classe."
        confirmLabel="Retirer"
        onConfirm={() => run(() => removePlayer(classId, player.playerId), "Joueur retiré")}
        trigger={
          <Button variant="ghost" size="sm" aria-label={`Retirer ${player.name}`}>
            <Trash2Icon />
          </Button>
        }
      />
    </div>
  );
}

export function ImportToClassButton({ classId }: { classId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, run] = useAction();
  return (
    <>
      <Button variant="outline" onClick={() => input.current?.click()} disabled={pending}>
        <UploadIcon /> Importer un fichier de quiz
      </Button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) {
            const text = await file.text();
            run(() => importToClass(classId, text), "Quiz ajouté à la classe");
          }
        }}
      />
    </>
  );
}

export function SuggestionActions({ id, status }: { id: string; status: "open" | "done" | "dismissed" }) {
  const [pending, run] = useAction();
  if (status !== "open") {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => updateSuggestion(id, "open"))}>
        Rouvrir
      </Button>
    );
  }
  return (
    <div className="flex shrink-0 gap-1">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => updateSuggestion(id, "done"))}>
        Traité
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => updateSuggestion(id, "dismissed"))}>
        Ignorer
      </Button>
    </div>
  );
}
