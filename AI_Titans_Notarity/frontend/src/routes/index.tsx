import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, FileText, Sparkles, ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { useBooking } from "@/lib/booking-store";
import { Button } from "@/components/ui/button";
import { Chatbot } from "@/components/Chatbot";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Notarity — Book your notary appointment faster" },
      { name: "description", content: "Start with a document, or let the assistant guide you step by step." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { reset } = useBooking();

  useEffect(() => {
    reset();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur">
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

      <main className="mx-auto max-w-[1100px] px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            AI-assisted notary booking
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Book your notary appointment faster
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Start with a document, or let the assistant guide you step by step.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-card">
          <h2 className="text-lg font-medium text-foreground">Do you already have the document ready?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what fits — you can always change later.
          </p>

          <div className="mt-6 grid gap-3">
            <ChoiceLink
              to="/upload"
              icon={<FileText className="h-5 w-5 text-secondary" />}
              title="Yes, I have a document"
              description="Upload it and we'll pre-fill the details we can detect."
              primary
            />
            <ChoiceLink
              to="/product"
              icon={<Sparkles className="h-5 w-5 text-accent" />}
              title="No, I need help setting up the appointment"
              description="The assistant will walk you through smart questions."
            />
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Demo only — no real documents, payments, or legal advice.
        </p>
      </main>
    </div>
  );
}

function ChoiceLink({
  icon,
  title,
  description,
  to,
  primary,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  to: "/upload" | "/product";
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={[
        "group flex items-center justify-between gap-4 rounded-xl border p-4 text-left transition",
        primary
          ? "border-secondary/30 bg-secondary/5 hover:border-secondary hover:bg-secondary/10"
          : "border-border bg-card hover:border-secondary/40 hover:bg-muted/40",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-muted">{icon}</div>
        <div>
          <div className="font-medium text-foreground">{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-secondary" />
    </Link>
  );
}

// keep Button referenced for tree-shake friendliness
export const _b = Button;