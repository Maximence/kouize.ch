"use client";

import { MessageSquareWarningIcon } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { suggestFix } from "@/lib/actions/suggestions";

const KINDS = [
  ["wrong-answer", "La réponse est fausse"],
  ["unclear", "La question n'est pas claire"],
  ["typo", "Faute de frappe ou mise en forme"],
  ["other", "Autre chose"],
] as const;

/** Lets a student tell the teacher something is off with a question. */
export function SuggestFix({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("wrong-answer");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) return <span className="text-xs text-muted-foreground">Suggestion envoyée, merci !</span>;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <MessageSquareWarningIcon /> Suggérer une correction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await suggestFix({ questionId, kind, message });
              if (!res.ok) return void toast.error(res.error);
              setOpen(false);
              setSent(true);
              toast.success("Envoyé à ton enseignant. Merci !");
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Suggérer une correction</DialogTitle>
            <DialogDescription>Tu as repéré une erreur ? Ton enseignant voit ton message avec ton nom.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={kind} onValueChange={(v) => setKind(v as typeof kind)} className="grid gap-2">
            {KINDS.map(([value, label]) => (
              <Label key={value} className="flex items-center gap-3 font-normal">
                <RadioGroupItem value={value} /> {label}
              </Label>
            ))}
          </RadioGroup>
          <div className="grid gap-1.5">
            <Label htmlFor={`suggestion-${questionId}`}>Qu&apos;est-ce qui devrait changer ?</Label>
            <Textarea
              id={`suggestion-${questionId}`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="par ex. Les notes disent 44,1 kHz, pas 48 kHz."
              required
              minLength={3}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Envoyer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
