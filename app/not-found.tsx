import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid place-items-center gap-3 py-16 text-center">
      <p className="text-5xl">🔍</p>
      <h1 className="text-2xl">Page introuvable</h1>
      <p className="text-muted-foreground">Cette page n&apos;existe pas, ou tu n&apos;y as pas accès.</p>
      <Button asChild variant="outline">
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </div>
  );
}
