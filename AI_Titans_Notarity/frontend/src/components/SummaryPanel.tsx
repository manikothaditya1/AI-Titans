import { useBooking } from "@/lib/booking-store";
import { billingLabel, apostilleLabel } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, FileText } from "lucide-react";

export function SummaryPanel() {
  const { draft } = useBooking();

  const slotDisplay =
    draft.slotDate && draft.slotTime ? `${draft.slotDate}, ${draft.slotTime}` : draft.slot;

  const docs = draft.selectedDocuments;

  const rows: { label: string; value: string }[] = [
    { label: "Country of use", value: draft.countryOfUse },
    { label: "Apostille", value: draft.apostille ? apostilleLabel(draft.apostille) : "" },
    { label: "Delivery", value: draft.deliveryMethod },
    { label: "Appointment language", value: draft.appointmentLanguage },
    {
      label: "Participants",
      value:
        draft.participantsList.length > 0
          ? `${draft.participantsList.length} participant${draft.participantsList.length > 1 ? "s" : ""}`
          : draft.participants,
    },
    { label: "Billing", value: draft.billingMethod ? billingLabel(draft.billingMethod) : "" },
    { label: "Slot", value: slotDisplay },
  ];

  return (
    <Card className="border-border shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Appointment draft
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Selected documents
          </div>
          {docs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No documents selected yet.</div>
          ) : (
            <ol className="space-y-1.5">
              {docs.map((d, i) => (
                <li key={d.id} className="flex items-start gap-2 text-sm">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                  <span>
                    <span className="text-muted-foreground">{i + 1}.</span>{" "}
                    <span className="font-medium">{d.productTitle}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          {rows.map((r) => {
            const filled = Boolean(r.value);
            return (
              <div key={r.label} className="flex items-start gap-2 text-sm">
                {filled ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{r.label}</div>
                  <div className={filled ? "font-medium text-foreground" : "text-muted-foreground"}>
                    {filled ? r.value : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
