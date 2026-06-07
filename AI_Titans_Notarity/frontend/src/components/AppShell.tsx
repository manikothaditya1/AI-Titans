import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

export function AppShell({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
  showProgress?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">Notarity</span>
          </Link>
          <span className="text-xs text-muted-foreground">AI Appointment Builder</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-10">
        {right ? (
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0">{children}</div>
            <aside className="lg:sticky lg:top-32 lg:self-start">{right}</aside>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}