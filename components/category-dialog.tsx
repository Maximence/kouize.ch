"use client";

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
import { createCategory, updateCategory } from "@/lib/actions/categories";
import { cn } from "@/lib/utils";

// Pastel subject colors (teal, coral, butter, mint, sky, peach, sage, rose, sand, lilac).
export const CATEGORY_COLORS = [
  "#8fd3cc", "#f4a78f", "#f6d77a", "#a8e0c0", "#9ccbea",
  "#fbc49a", "#bcd59c", "#f2a9bb", "#e3cfa6", "#c9b8ec",
];
const EMOJIS = ["📘", "🧮", "🎧", "💻", "🧪", "🧬", "📐", "🌍", "⚖️", "🎨", "📊", "🧠"];

type Props = {
  trigger: React.ReactNode;
  category?: { id: string; name: string; color: string; emoji: string };
};

export function CategoryDialog({ trigger, category }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]);
  const [emoji, setEmoji] = useState(category?.emoji ?? EMOJIS[0]);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const input = { name, color, emoji };
      const res = category ? await updateCategory(category.id, input) : await createCategory(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      if (!category && res.data) router.push(`/c/${res.data.id}`);
      else toast.success("Matière mise à jour");
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !category) setName("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{category ? "Modifier la matière" : "Nouvelle matière"}</DialogTitle>
            <DialogDescription>Une matière regroupe les notes et les quiz d&apos;un cours.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="category-name">Nom</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="par ex. Traitement du signal"
              autoFocus
              maxLength={80}
            />
          </div>
          <div className="grid gap-2">
            <Label>Emoji</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  aria-pressed={emoji === e}
                  className={cn(
                    "grid size-9 place-items-center rounded-md border text-lg transition-colors hover:bg-muted",
                    emoji === e && "border-foreground bg-muted",
                  )}
                >
                  {e}
                </button>
              ))}
              <Input
                aria-label="Emoji personnalisé"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="h-9 w-16 text-center text-lg"
                maxLength={8}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Couleur</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Couleur ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-7 rounded-full ring-offset-2 ring-offset-background transition",
                    color === c && "ring-2 ring-foreground",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {category ? "Enregistrer" : "Créer la matière"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
