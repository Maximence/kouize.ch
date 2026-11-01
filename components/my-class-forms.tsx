"use client";

import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  FileJsonIcon,
  FileTextIcon,
  Loader2Icon,
  LockIcon,
  LogOutIcon,
  MailIcon,
  PaperclipIcon,
  Trash2Icon,
  UploadIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
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
  addNotes,
  createMyClass,
  declineInvite,
  deleteMyClass,
  deleteMyQuiz,
  deleteNote,
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
import { SUBJECT_EMOJIS } from "@/lib/subject-style";

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

type Subject = { name: string; emoji: string; color: string };

const NEW_SUBJECT = "__new__";
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * Add a quiz: the matière it belongs to (an existing one or a new one), the quiz
 * itself (pasted from the AI or a .json file), and the notes it was made from.
 */
export function UploadQuiz({ classId, prompt, subjects, onDone }: { classId: string; prompt: string; subjects: Subject[]; onDone?: () => void }) {
  const quizInput = useRef<HTMLInputElement>(null);
  const notesInput = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState(subjects.length ? subjects[0].name : NEW_SUBJECT);
  const [newName, setNewName] = useState("");
  const [emoji, setEmoji] = useState(SUBJECT_EMOJIS[0]);
  const [text, setText] = useState("");
  const [quizFile, setQuizFile] = useState<string | null>(null);
  const [notes, setNotes] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const creating = subject === NEW_SUBJECT;

  const submit = () =>
    startTransition(async () => {
      const form = new FormData();
      form.set("subject", creating ? newName : subject);
      form.set("emoji", emoji);
      form.set("quiz", text);
      for (const f of notes) form.append("notes", f);
      const res = await uploadQuiz(classId, form);
      if (!res.ok) return void toast.error(res.error, { duration: 10_000 });
      toast.success("Quiz ajouté à la classe");
      setText("");
      setQuizFile(null);
      setNotes([]);
      onDone?.();
    });

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <Label htmlFor="quiz-subject">1. Matière</Label>
        <select id="quiz-subject" className={selectClass} value={subject} onChange={(e) => setSubject(e.target.value)}>
          {subjects.map((s) => (
            <option key={s.name} value={s.name}>
              {s.emoji} {s.name}
            </option>
          ))}
          <option value={NEW_SUBJECT}>➕ Nouvelle matière…</option>
        </select>
        {creating && (
          <div className="grid gap-2 rounded-md border p-3">
            <Label htmlFor="new-subject-name">Nom de la nouvelle matière</Label>
            <Input id="new-subject-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="par ex. Biologie" maxLength={60} />
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Emoji de la matière">
              {SUBJECT_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={emoji === e}
                  onClick={() => setEmoji(e)}
                  className={`grid size-8 place-items-center rounded-md border text-lg ${emoji === e ? "border-primary ring-1 ring-primary" : ""}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <Label htmlFor="paste-quiz">2. Le quiz</Label>
        <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
          <li>Copie le prompt et colle-le dans ton IA (ChatGPT, Claude, Gemini…), suivi de tes notes.</li>
          <li>Colle sa réponse ci-dessous, ou envoie-la dans un fichier <code>.json</code>.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={prompt} label="Copier le prompt pour ton IA" />
          <Button type="button" variant="outline" size="sm" onClick={() => quizInput.current?.click()} disabled={pending}>
            <UploadIcon /> Envoyer un fichier de quiz
          </Button>
          <input
            ref={quizInput}
            type="file"
            accept=".json,application/json,.txt,text/plain"
            hidden
            data-testid="upload-quiz-input"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setText(await file.text());
              setQuizFile(file.name);
            }}
          />
        </div>
        {quizFile ? (
          <p className="flex items-center gap-2 text-sm">
            <FileJsonIcon className="size-4" /> {quizFile}
            <Button type="button" variant="ghost" size="sm" onClick={() => (setQuizFile(null), setText(""))}>
              Retirer
            </Button>
          </p>
        ) : (
          <Textarea
            id="paste-quiz"
            aria-label="Ou colle la réponse de l'IA"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Colle ici la réponse de ton IA : { "format": "mdquiz-quiz", … }'
            className="min-h-28 font-mono text-xs"
          />
        )}
      </section>

      <section className="grid gap-2">
        <Label>3. Tes notes (facultatif)</Label>
        <p className="text-sm text-muted-foreground">
          Les notes d&apos;où vient le quiz (PDF, TXT ou MD, 15 Mo max chacun). Toute la classe pourra les lire dans
          l&apos;onglet Notes.
        </p>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => notesInput.current?.click()} disabled={pending}>
            <PaperclipIcon /> Joindre des notes
          </Button>
          <input
            ref={notesInput}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            hidden
            data-testid="upload-notes-input"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = "";
              setNotes((n) => [...n, ...picked].slice(0, 5));
            }}
          />
        </div>
        {notes.length > 0 && (
          <ul className="grid gap-1 text-sm" data-testid="picked-notes">
            {notes.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                <FileTextIcon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <Button type="button" variant="ghost" size="sm" aria-label={`Retirer ${f.name}`} onClick={() => setNotes((n) => n.filter((_, k) => k !== i))}>
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button type="button" className="w-fit" disabled={pending || !text.trim() || (creating && !newName.trim())} onClick={submit}>
        {pending && <Loader2Icon className="animate-spin" />} Ajouter le quiz
      </Button>
    </div>
  );
}

export function AddQuizDialog({ classId, prompt, subjects, trigger }: { classId: string; prompt: string; subjects: Subject[]; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un quiz</DialogTitle>
          <DialogDescription>
            Génère-le avec ta propre IA, ou envoie un fichier exporté depuis KOUIZE. Toute la classe pourra y jouer.
          </DialogDescription>
        </DialogHeader>
        <UploadQuiz classId={classId} prompt={prompt} subjects={subjects} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Attach notes to a quiz that's already in the class. */
export function AddNotesButton({ classId, quizId, title }: { classId: string; quizId: string; title: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, run] = useAction();
  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => input.current?.click()} aria-label={`Joindre des notes à ${title}`}>
        <PaperclipIcon />
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          const form = new FormData();
          for (const f of files) form.append("notes", f);
          run(() => addNotes(classId, quizId, form), files.length > 1 ? "Notes ajoutées" : "Note ajoutée");
        }}
      />
    </>
  );
}

export function DeleteNoteButton({ classId, noteId, name }: { classId: string; noteId: string; name: string }) {
  const [, run] = useAction();
  return (
    <ConfirmDialog
      title={`Supprimer « ${name} » ?`}
      description="Le fichier de notes est supprimé pour toute la classe. Le quiz reste."
      onConfirm={() => run(() => deleteNote(classId, noteId), "Fichier supprimé")}
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Supprimer ${name}`}>
          <Trash2Icon />
        </Button>
      }
    />
  );
}

export function OwnerQuizActions({ classId, quiz }: { classId: string; quiz: { id: string; title: string; hidden: boolean } }) {
  const [pending, run] = useAction();
  return (
    <div className="flex shrink-0 gap-1">
      <AddNotesButton classId={classId} quizId={quiz.id} title={quiz.title} />
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
