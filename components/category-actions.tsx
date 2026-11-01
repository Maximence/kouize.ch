"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CategoryDialog } from "@/components/category-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteCategory } from "@/lib/actions/categories";

type Props = { category: { id: string; name: string; color: string; emoji: string } };

export function CategoryActions({ category }: Props) {
  const router = useRouter();
  return (
    <div className="flex shrink-0 gap-2 sm:ml-auto">
      <CategoryDialog
        category={category}
        trigger={
          <Button variant="outline" size="sm">
            <PencilIcon /> Modifier
          </Button>
        }
      />
      <ConfirmDialog
        title={`Supprimer « ${category.name} » ?`}
        description="La matière est supprimée définitivement avec tous ses fichiers, quiz et tentatives."
        onConfirm={async () => {
          const res = await deleteCategory(category.id);
          if (!res.ok) return toast.error(res.error);
          toast.success("Matière supprimée");
          router.push("/");
        }}
        trigger={
          <Button variant="destructive" size="sm" aria-label="Supprimer la matière">
            <Trash2Icon />
          </Button>
        }
      />
    </div>
  );
}
