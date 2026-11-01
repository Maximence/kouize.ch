import { CircleUserIcon, LibraryIcon, LogInIcon, RepeatIcon, SettingsIcon, ShieldIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { currentUser, isAdmin } from "@/lib/auth/session";
import { isHosted } from "@/lib/settings";
import { dueCount } from "@/lib/study";

const navLink = "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold sm:px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="page-container mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-8">
        <Link href="/" aria-label="Accueil KOUIZE">
          <Logo />
        </Link>
        <nav className="ml-auto flex items-center gap-0.5 text-sm sm:gap-1">
          <Suspense fallback={null}>
            <NavLinks />
          </Suspense>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

/** Studio on your computer; classes (and admin, for you) online. Read at request time, not at build. */
async function NavLinks() {
  await connection();
  if (isHosted()) {
    const user = await currentUser();
    return (
      <>
        {user && (
          <Link href="/" className={navLink} aria-label="Mes classes">
            <UsersIcon className="size-5 sm:hidden" />
            <span className="hidden sm:inline">Mes classes</span>
          </Link>
        )}
        {user ? (
          <Link href="/account" className={navLink} aria-label="Mon compte" data-testid="account-link">
            <CircleUserIcon className="size-5 sm:hidden" />
            <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
          </Link>
        ) : (
          <Link href="/login" className={navLink} aria-label="Se connecter">
            <LogInIcon className="size-5 sm:hidden" />
            <span className="hidden sm:inline">Se connecter</span>
          </Link>
        )}
        {(await isAdmin()) && (
          <Link href="/admin" className={navLink} aria-label="Admin">
            <ShieldIcon className="size-5 sm:hidden" />
            <span className="hidden sm:inline">Admin</span>
          </Link>
        )}
      </>
    );
  }
  return (
    <>
      <Link href="/" className={navLink} aria-label="Matières">
        <LibraryIcon className="size-5 sm:hidden" />
        <span className="hidden sm:inline">Matières</span>
      </Link>
      <Link href="/review" className={navLink} aria-label="Révision">
        <RepeatIcon className="size-5 sm:hidden" />
        <span className="hidden sm:inline">Révision</span>
        <DueBadge />
      </Link>
      <Link href="/settings" className={navLink} aria-label="Réglages">
        <SettingsIcon className="size-5 sm:hidden" />
        <span className="hidden sm:inline">Réglages</span>
      </Link>
    </>
  );
}

async function DueBadge() {
  const n = await dueCount();
  if (!n) return null;
  return (
    <span className="rounded-sm bg-primary px-1.5 text-[0.7rem] font-medium tabular-nums text-primary-foreground" aria-label={`${n} à réviser`}>
      {n}
    </span>
  );
}
