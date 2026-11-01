"use client";

import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, LockIcon, LogOutIcon, MailIcon, Trash2Icon, UploadIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  acceptInviteById,
  acceptInviteToken,
  createMyClass,
  declineInvite,
  deleteMyClass,
  deleteMyQuiz,
  inviteToClass,
  leaveClass,
  removeMyMember,
  revokeInvite,
  setMyQuizHidden,
  updateMyClass,
  uploadQuiz,
  type InviteOutcome,
} from "@/lib/actions/my-classes";
import type { ActionResult } from "@/lib/actions/result";

type Kind = "private" | "personal";

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

function KindChoice({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as Kind)} className="gap-3">
      <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary">
        <RadioGroupItem value="private" aria-label="Privée" className="mt-0.5" />
        <span className="grid gap-0.5">
          <span className="flex items-center gap-1.5 font-semibold">
            <LockIcon className="size-4" /> Privée
          </span>
          <span className="text-sm text-muted-foreground">Invite des gens par e-mail. Eux seuls la voient.</span>
        </span>
      </Label>
      <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary">
        <RadioGroupItem value="personal" aria-label="Personnelle" className="mt-0.5" />
        <span className="grid gap-0.5">
          <span className="flex items-center gap-1.5 font-semibold">
            <UserIcon className="size-4" /> Personnelle
          </span>
          <span className="text-sm text-muted-foreground">Rien que pour toi : entraîne-toi sur tes propres quiz et suis tes XP.</span>
        </span>
      </Label>
    </RadioGroup>
  );
}

export function NewClassDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("private");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await createMyClass({ name, kind });
              if (!res.ok) return void toast.error(res.error);
              setOpen(false);
              router.push(`/k/${res.data.code}?tab=manage`);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Nouvelle classe</DialogTitle>
            <DialogDescription>Ajoute des quiz faits avec ta propre IA, puis joue-les (seul ou avec tes amis).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="my-class-name">Nom</Label>
            <Input id="my-class-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Révisions de biologie" required maxLength={80} />
          </div>
          <KindChoice value={kind} onChange={setKind} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Créer la classe
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClassSettingsForm({ cls }: { cls: { id: string; name: string; kind: Kind } }) {
  const [name, setName] = useState(cls.name);
  const [kind, setKind] = useState<Kind>(cls.kind);
  const [pending, run] = useAction();
  return (
    <form
      className="grid gap-4 sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateMyClass(cls.id, { name, kind }), "Classe enregistrée");
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="class-settings-name">Nom</Label>
        <Input id="class-settings-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      </div>
      <KindChoice value={kind} onChange={setKind} />
      {cls.kind === "private" && kind === "personal" && (
        <p className="text-sm text-muted-foreground">Les membres actuels restent. Retire-les ci-dessous si tu veux la classe pour toi seul.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          Enregistrer
        </Button>
        <ConfirmDialog
          title={`Supprimer « ${cls.name} » ?`}
          description="Ses quiz, les résultats de chacun et le classement sont supprimés définitivement."
          onConfirm={() => run(() => deleteMyClass(cls.id))}
          trigger={
            <Button type="button" variant="ghost" className="text-destructive">
              <Trash2Icon /> Supprimer la classe
            </Button>
          }
        />
      </div>
    </form>
  );
}

function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Impossible de copier. Sélectionne le texte et copie-le à la main.");
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : label}
    </Button>
  );
}

/** Upload a JSON file or paste what the AI answered, with the prompt that makes it produce the right format. */
export function UploadQuiz({ classId, prompt }: { classId: string; prompt: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const send = (body: string) =>
    startTransition(async () => {
      const res = await uploadQuiz(classId, body);
      if (!res.ok) return void toast.error(res.error, { duration: 10_000 });
      toast.success("Quiz ajouté à la classe");
      setText("");
    });
  return (
    <div className="grid gap-4">
      <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
        <li>Copie le prompt et colle-le dans ton IA (ChatGPT, Claude, Gemini…), suivi de tes notes.</li>
        <li>Colle sa réponse ci-dessous, ou enregistre-la dans un fichier <code>.json</code> et envoie-le.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={prompt} label="Copier le prompt pour ton IA" />
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={pending}>
          <UploadIcon /> Envoyer un fichier de quiz
        </Button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json,.txt,text/plain"
          hidden
          data-testid="upload-quiz-input"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) send(await file.text());
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="paste-quiz">Ou colle la réponse de l&apos;IA</Label>
        <Textarea
          id="paste-quiz"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "format": "mdquiz-quiz", "version": 1, "quiz": { … }, "questions": [ … ] }'
          className="min-h-32 font-mono text-xs"
        />
      </div>
      <Button type="button" className="w-fit" disabled={pending || !text.trim()} onClick={() => send(text)}>
        Ajouter le quiz
      </Button>
    </div>
  );
}

export function AddQuizDialog({ classId, prompt, trigger }: { classId: string; prompt: string; trigger: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un quiz</DialogTitle>
          <DialogDescription>
            Génère-le avec ta propre IA, ou envoie un fichier exporté depuis KOUIZE. Toute la classe pourra y jouer.
          </DialogDescription>
        </DialogHeader>
        <UploadQuiz classId={classId} prompt={prompt} />
      </DialogContent>
    </Dialog>
  );
}

export function OwnerQuizActions({ classId, quiz }: { classId: string; quiz: { id: string; title: string; hidden: boolean } }) {
  const [pending, run] = useAction();
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setMyQuizHidden(classId, quiz.id, !quiz.hidden))}
        aria-label={quiz.hidden ? "Montrer dans la classe" : "Masquer dans la classe"}
      >
        {quiz.hidden ? <EyeIcon /> : <EyeOffIcon />} {quiz.hidden ? "Montrer" : "Masquer"}
      </Button>
      <ConfirmDialog
        title={`Supprimer « ${quiz.title} » ?`}
        description="Le quiz est supprimé avec toutes ses tentatives, ce qui retire aussi ses points du classement. Le masquer garde les points."
        onConfirm={() => run(() => deleteMyQuiz(classId, quiz.id), "Quiz supprimé")}
        trigger={
          <Button variant="ghost" size="sm" aria-label={`Supprimer ${quiz.title}`}>
            <Trash2Icon />
          </Button>
        }
      />
    </div>
  );
}

export function InviteForm({ classId }: { classId: string }) {
  const [emails, setEmails] = useState("");
  const [results, setResults] = useState<InviteOutcome[]>([]);
  const [pending, startTransition] = useTransition();
  const links = results.filter((r) => r.status === "link");
  return (
    <div className="grid gap-3">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await inviteToClass(classId, emails);
            if (!res.ok) return void toast.error(res.error);
            setResults(res.data);
            setEmails("");
            const sent = res.data.filter((r) => r.status === "sent").length;
            const already = res.data.filter((r) => r.status === "member").length;
            if (sent) toast.success(sent === 1 ? "Invitation envoyée" : `${sent} invitations envoyées`);
            if (already) toast.info(already === 1 ? "1 personne fait déjà partie de la classe" : `${already} personnes font déjà partie de la classe`);
          });
        }}
      >
        <Label htmlFor="invite-emails">Adresses e-mail</Label>
        <Textarea
          id="invite-emails"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="ana@exemple.ch, leo@exemple.ch"
          className="min-h-20"
        />
        <Button type="submit" className="w-fit" disabled={pending || !emails.trim()}>
          <MailIcon /> Inviter
        </Button>
      </form>
      {links.length > 0 && (
        <div className="grid gap-2 rounded-md border bg-muted/50 p-3" data-testid="invite-links">
          <p className="text-sm">
            Ce site ne peut pas envoyer d&apos;e-mails : envoie ces liens toi-même. Chacun marche une fois, pendant 14 jours. Les personnes
            voient aussi l&apos;invitation en se connectant avec cet e-mail.
          </p>
          {links.map((r) => (
            <div key={r.email} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{r.email}</span>
              <code className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1 text-xs" data-testid="invite-link">
                {r.link}
              </code>
              <CopyButton text={r.link!} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RevokeInviteButton({ classId, inviteId, email }: { classId: string; inviteId: string; email: string }) {
  const [pending, run] = useAction();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeInvite(classId, inviteId))} aria-label={`Annuler l'invitation de ${email}`}>
      Annuler
    </Button>
  );
}

export function RemoveMemberButton({ classId, member }: { classId: string; member: { playerId: string; name: string } }) {
  const [, run] = useAction();
  return (
    <ConfirmDialog
      title={`Retirer ${member.name} ?`}
      description="Ses tentatives et badges dans cette classe sont supprimés. Tu pourras l'inviter à nouveau plus tard."
      confirmLabel="Retirer"
      onConfirm={() => run(() => removeMyMember(classId, member.playerId), "Retiré de la classe")}
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Retirer ${member.name}`}>
          <Trash2Icon />
        </Button>
      }
    />
  );
}

export function LeaveClassButton({ classId, name }: { classId: string; name: string }) {
  const [, run] = useAction();
  return (
    <ConfirmDialog
      title={`Quitter « ${name} » ?`}
      description="Tes résultats et badges dans cette classe sont supprimés. Il te faudrait une nouvelle invitation pour revenir."
      confirmLabel="Quitter"
      onConfirm={() => run(() => leaveClass(classId))}
      trigger={
        <Button variant="outline">
          <LogOutIcon /> Quitter la classe
        </Button>
      }
    />
  );
}

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, run] = useAction();
  return (
    <Button size="lg" className="font-semibold" disabled={pending} onClick={() => run(() => acceptInviteToken(token))}>
      Rejoindre la classe
    </Button>
  );
}

export function PendingInviteActions({ inviteId }: { inviteId: string }) {
  const [pending, run] = useAction();
  return (
    <div className="flex shrink-0 gap-1">
      <Button size="sm" disabled={pending} onClick={() => run(() => acceptInviteById(inviteId))}>
        Rejoindre
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => declineInvite(inviteId))}>
        Refuser
      </Button>
    </div>
  );
}
