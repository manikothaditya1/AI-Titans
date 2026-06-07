import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CreditCard, Loader2, Lock } from "lucide-react";
import { useBooking } from "@/lib/booking-store";
import {
  finalizeBooking,
  submitNotarityAppointment,
  priceNotarityBooking,
  type NotarityPriceLineItem,
} from "@/lib/booking-api";


export const Route = createFileRoute("/payment")({
  head: () => ({ meta: [{ title: "Payment — Notarity" }] }),
  component: PaymentPage,
});

function formatEuro(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  const hasCents = Math.round(value * 100) % 100 !== 0;

  return value.toLocaleString("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function formatCents(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return formatEuro(value / 100);
}

function PaymentPage() {
  const navigate = useNavigate();
  const { draft, update } = useBooking();

  const [processing, setProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [confirmedPrice, setConfirmedPrice] = useState<number | null>(null);
  const [lineItems, setLineItems] = useState<NotarityPriceLineItem[]>([]);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const payAtAppointment = draft.billingMethod === "pay_at_appointment";

  useEffect(() => {
    let cancelled = false;

    async function loadPrice() {
      setPricingLoading(true);
      setPricingError(null);

      try {
        const result = await priceNotarityBooking(draft, draft.bookingId || undefined);

        if (cancelled) return;

        if (result.status === "missing_fields") {
          setConfirmedPrice(null);
          setLineItems([]);
          setPricingError(
            "Cannot price yet. Missing: " + result.missing_fields.join(", "),
          );
          return;
        }

        if (result.confirmedPrice === null || result.confirmedPrice === undefined) {
          setConfirmedPrice(null);
          setLineItems([]);
          setPricingError(
            result.pricing_warning ||
              "Real Notarity staging pricing is unavailable. No fake price is shown.",
          );
          return;
        }

        setConfirmedPrice(result.confirmedPrice);
        setLineItems(result.line_items || []);
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setConfirmedPrice(null);
          setLineItems([]);
          setPricingError(
            "Could not load real Notarity staging pricing. No fake price is shown.",
          );
        }
      } finally {
        if (!cancelled) {
          setPricingLoading(false);
        }
      }
    }

    loadPrice();

    return () => {
      cancelled = true;
    };
  }, []);

  const pay = async () => {
    setProcessing(true);
    setSubmitError(null);

    try {
      // Match the sample flow: finalize/save the booking payload first, then submit
      // the appointment request to Notarity as multipart files + payload.
      const finalized = await finalizeBooking(draft, draft.bookingId || undefined);

      if (finalized.status === "missing_fields") {
        setSubmitError(
          "Cannot submit: missing fields — " + finalized.missing_fields.join(", "),
        );
        setProcessing(false);
        return;
      }

      const bookingId = finalized.booking_id || draft.bookingId;
      const draftForSubmit = { ...draft, bookingId };

      if (bookingId && bookingId !== draft.bookingId) {
        update({ bookingId });
      }

      const result = await submitNotarityAppointment(
        draftForSubmit,
        bookingId || undefined,
      );

      if (result.status === "missing_fields") {
        setSubmitError(
          "Cannot submit: missing fields — " + (result.missing_fields ?? []).join(", "),
        );
        setProcessing(false);
        return;
      }

      if (result.status === "submission_failed") {
        // Surface the actual Notarity error body so it is debuggable.
        const notarityMsg =
          result.submission?.response != null
            ? " — " + (typeof result.submission.response === "string"
                ? result.submission.response
                : JSON.stringify(result.submission.response))
            : "";
        setSubmitError(
          `Notarity staging rejected the request (HTTP ${result.submission?.status_code ?? "?"})${notarityMsg}`,
        );
        // Still advance after a delay so the demo flow completes.
        setTimeout(() => navigate({ to: "/confirmation" }), 4000);
        return;
      }

      // status === "submitted"
      navigate({ to: "/confirmation" });
    } catch (err) {
      console.error(err);
      setSubmitError(
        err instanceof Error ? err.message : "Could not reach the backend. Is it running?",
      );
      setProcessing(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto grid max-w-3xl gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Payment</h1>
          <p className="mt-2 text-muted-foreground">
            {draft.product || "Power of Attorney notarisation"} appointment ·{" "}
            {draft.appointmentLanguage || "English"}
          </p>

          <Card className="mt-6 border-border shadow-card">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                {payAtAppointment
                  ? "Payment will be collected at the appointment. No card is charged now."
                  : "Demo payment screen — no card is charged."}
              </div>

              {!payAtAppointment && (
                <div className="grid gap-3">
                  <div>
                    <Label>Card number</Label>
                    <div className="relative">
                      <Input defaultValue="4242 4242 4242 4242" />
                      <CreditCard className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Expiry</Label>
                      <Input defaultValue="12/29" />
                    </div>
                    <div>
                      <Label>CVC</Label>
                      <Input defaultValue="123" />
                    </div>
                  </div>

                  <div>
                    <Label>Name on card</Label>
                    <Input defaultValue="Anna Müller" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {submitError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => navigate({ to: "/review" })}>
              Back
            </Button>
            <Button
              onClick={pay}
              disabled={processing || pricingLoading}
              className="bg-brand hover:bg-brand/90"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : (
                payAtAppointment ? "Book appointment" : "Pay and book appointment"
              )}
            </Button>
          </div>
        </div>

        <Card className="h-fit border-border shadow-card">
          <CardContent className="space-y-3 p-6">
            <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Estimated total
            </div>

            <div className="text-3xl font-semibold text-foreground">
              {pricingLoading ? (
                <span className="flex items-center gap-2 text-base text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading price...
                </span>
              ) : (
                formatEuro(confirmedPrice)
              )}
            </div>

            {lineItems.length > 0 && (
              <div className="space-y-1 border-t border-border pt-3 text-sm">
                {lineItems.map((item, index) => (
                  <Row
                    key={`${item.name || "line"}-${index}`}
                    k={item.name || "Line item"}
                    v={formatCents(item.net)}
                  />
                ))}
              </div>
            )}

            {pricingError && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>{pricingError}</span>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Price is loaded from Notarity staging. No fake fallback price is used.
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}