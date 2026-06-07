import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBooking } from "@/lib/booking-store";
import { billingLabel, apostilleLabel } from "@/lib/labels";
import { Pencil } from "lucide-react";

export const Route = createFileRoute("/review")({
  head: () => ({ meta: [{ title: "Review appointment — Notarity" }] }),
  component: ReviewPage,
});

function ReviewPage() {
  const navigate = useNavigate();
  const { draft } = useBooking();
  const c = draft.contactDetails;
  const b = draft.billingDetails;

  const formatDetails = (d: typeof b | typeof c) => {
    const name = `${d.firstName} ${d.lastName}`.trim();
    const phone =
      d.phoneCountryCode || d.phoneNumber
        ? `${d.phoneCountryCode || ""} ${d.phoneNumber || ""}`.trim()
        : d.phone || "";
    const addressLine = [
      [d.street, d.apartment].filter(Boolean).join(", "),
      [d.zipCode, d.city].filter(Boolean).join(" ").trim(),
      d.stateRegion,
      d.country,
    ]
      .filter(Boolean)
      .join(", ");
    const lines = [name, d.email, phone, addressLine].filter(Boolean);
    return lines.length ? lines.join("\n") : "—";
  };

  const docsList =
    draft.selectedDocuments.length > 0
      ? draft.selectedDocuments.map((d, i) => `${i + 1}. ${d.productTitle}`).join("\n")
      : draft.product || "—";

  const participantRows: [string, string][] =
    draft.participantsList.length > 0
      ? draft.participantsList.map((p, i) => {
          const role =
            p.role === "signer"
              ? p.needsToSign
                ? "Signer"
                : "Signer (not signing)"
              : p.role === "viewer"
                ? "Viewer / advisor"
                : "Company representative";
          return [i === 0 ? "Main participant" : `Participant ${i + 1}`, `${p.email} · ${role}`];
        })
      : [["Participants", "—"]];

  const sections: { title: string; rows: [string, string][]; edit: () => void }[] = [
    {
      title: "Documents",
      edit: () => navigate({ to: "/product" }),
      rows: [["Selected", docsList]],
    },
    {
      title: "Country and recipient",
      edit: () => navigate({ to: "/questions" }),
      rows: [
        ["Country of use", draft.countryOfUse || "—"],
        ["Apostille", draft.apostille ? apostilleLabel(draft.apostille) : "—"],
      ],
    },
    {
      title: "Participants",
      edit: () => navigate({ to: "/questions" }),
      rows: participantRows,
    },
    {
      title: "Appointment",
      edit: () => navigate({ to: "/questions" }),
      rows: [
        ["Mode", draft.mode || "Online video appointment"],
        ["Date and time", draft.slotDate && draft.slotTime ? `${draft.slotDate}, ${draft.slotTime}` : draft.slot || "—"],
        ["Time zone", draft.timezone || "Europe/Vienna"],
        ["Appointment language", draft.appointmentLanguage || draft.language || "English"],
        ["Notary", draft.notary || "Dr. Sophia Berger"],
      ],
    },
    {
      title: "Billing details",
      edit: () => navigate({ to: "/billing" }),
      rows: [
        ["Billing", formatDetails(b)],
        ...(b.isCompany
          ? ([
              ["Company", b.companyName || "—"],
              ["VAT", b.vatNumber || "—"],
            ] as [string, string][])
          : []),
      ],
    },
    {
      title: "Contact details",
      edit: () => navigate({ to: "/billing" }),
      rows: draft.sameContactAsBilling
        ? ([["Contact", "Same as billing details"]] as [string, string][])
        : [["Contact", formatDetails(c)]],
    },
    {
      title: "Payment",
      edit: () => navigate({ to: "/questions" }),
      rows: [["Payment method", draft.billingMethod ? billingLabel(draft.billingMethod) : "—"]],
    },
    {
      title: "Terms",
      edit: () => navigate({ to: "/questions" }),
      rows: [["Terms and Conditions", draft.termsAccepted ? "Accepted" : "Pending"]],
    },
  ];

  return (
    <AppShell>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Review your appointment</h1>
          <p className="mt-2 text-muted-foreground">Check the details before continuing to payment.</p>
        </div>
        <Badge className="bg-accent text-accent-foreground hover:bg-accent">Ready to book</Badge>
      </div>

      <div className="mt-8 grid gap-4">
        {sections.map((s) => (
          <Card key={s.title} className="border-border shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{s.title}</CardTitle>
              <Button variant="ghost" size="sm" onClick={s.edit}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {s.rows.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
                  <span className="text-right text-sm font-medium whitespace-pre-line">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate({ to: "/billing" })}>
          Edit details
        </Button>
        <Button
          onClick={() => navigate({ to: "/payment" })}
          className="bg-brand hover:bg-brand/90"
        >
          {draft.billingMethod === "pay_at_appointment" ? "Review cost and book" : "Continue to payment"}
        </Button>
      </div>
    </AppShell>
  );
}