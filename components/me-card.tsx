"use client";

import { PencilIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameMe } from "@/lib/actions/classes";

export function RenameMe({ classId, name }: { classId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">{name}</span>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Changer mon nom">
          <PencilIcon />
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await renameMe(classId, value);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Nom changé");
          setEditing(false);
        });
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={24} className="w-56" autoFocus />
      <Button type="submit" size="sm" disabled={pending}>
        Enregistrer
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Annuler
      </Button>
    </form>
  );
}
