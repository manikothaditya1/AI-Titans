import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { SummaryPanel } from "@/components/SummaryPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useBooking } from "@/lib/booking-store";

export const Route = createFileRoute("/validation")({
  head: () => ({ meta: [{ title: "Booking check — Notarity" }] }),
  component: ValidationPage,
});

function ValidationPage() {
  const navigate = useNavigate();
  const { draft } = useBooking();

  const missing: string[] = [];
  if (!draft.countryOfUse) missing.push("Country of use");
  if (!draft.deliveryMethod) missing.push("Delivery method");
  if (!draft.billingMethod) missing.push("Billing method");
  if (!draft.slot) missing.push("Appointment slot");
  if (!draft.appointmentLanguage) missing.push("Appointment language");
  if (!draft.apostille) missing.push("Apostille answer");
  if (!draft.termsAccepted) missing.push("Terms and Conditions");

  const warnings: string[] = [];
  if (draft.countryOfUse === "India" && draft.apostille === "no") {
    warnings.push("India often requires an apostille — please verify with the receiving authority.");
  }
  if (draft.deliveryMethod === "Digital only (e-signed PDF)" && draft.countryOfUse !== "Austria") {
    warnings.push("Digital-only delivery may not be accepted abroad.");
  }

  const state: "success" | "warning" | "error" =
    missing.length > 0 ? "error" : warnings.length > 0 ? "warning" : "success";

  const titles = {
    success: { t: "Your appointment setup is ready", m: "All required booking details are complete.", icon: CheckCircle2, tone: "text-success bg-success/10 border-success/30" },
    warning: { t: "A few things to check", m: "You can continue, but please review these warnings.", icon: AlertTriangle, tone: "text-warning bg-warning/10 border-warning/40" },
    error: { t: "Some required information is missing", m: "Please complete the highlighted fields before booking.", icon: XCircle, tone: "text-destructive bg-destructive/10 border-destructive/30" },
  } as const;

  const cur = titles[state];
  const Icon = cur.icon;

  return (
    <AppShell right={<SummaryPanel />}>
      <h1 className="text-3xl font-semibold tracking-tight">Booking check</h1>
      <p className="mt-2 text-muted-foreground">We validated your appointment setup.</p>

      <Card className={`mt-6 border shadow-card ${cur.tone}`}>
        <CardContent className="flex items-start gap-4 p-6">
          <Icon className="mt-0.5 h-6 w-6" />
          <div>
            <div className="text-lg font-semibold text-foreground">{cur.t}</div>
            <div className="text-sm text-muted-foreground">{cur.m}</div>
          </div>
        </CardContent>
      </Card>

      {missing.length > 0 && (
        <Card className="mt-4 border-border shadow-card">
          <CardContent className="p-6">
            <div className="font-medium">Missing required</div>
            <ul className="mt-2 space-y-1 text-sm">
              {missing.map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> {m}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card className="mt-4 border-border shadow-card">
          <CardContent className="p-6">
            <div className="font-medium">Warnings</div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {warnings.map((m) => (
                <li key={m} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {m}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate({ to: "/questions" })}>
          Back to questions
        </Button>
        <Button
          onClick={() => navigate({ to: "/billing" })}
          disabled={state === "error"}
          className="bg-brand hover:bg-brand/90"
        >
          Continue to billing details
        </Button>
      </div>
    </AppShell>
  );
}
