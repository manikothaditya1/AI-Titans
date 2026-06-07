import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  Calendar,
  Video,
  Truck,
  Users,
  Languages,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useBooking } from "@/lib/booking-store";
import { billingLabel } from "@/lib/labels";
import { finalizeBooking } from "@/lib/booking-api";

export const Route = createFileRoute("/confirmation")({
  head: () => ({ meta: [{ title: "Booked — Notarity" }] }),
  component: Confirmation,
});

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}
function parseAppointmentDate(slotDate?: string, slotTime?: string) {
  if (!slotDate || !slotTime) return null;

  const cleanDate = slotDate.trim();
  const cleanTime = slotTime.trim();

  // Case 1: already ISO date like 2026-06-11
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    const parsed = new Date(`${cleanDate} ${cleanTime}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Case 2: date like "Monday 11 Jun", "Mon 08 Jun", "11 Jun"
  const months: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  const dateParts = cleanDate
    .replace(/,/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const dayPart = dateParts.find((part) => /^\d{1,2}$/.test(part));
  const monthPart = dateParts.find((part) => months[part.toLowerCase()] !== undefined);

  if (!dayPart || !monthPart) {
    const fallback = new Date(`${cleanDate} ${cleanTime}`);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const now = new Date();
  let year = now.getFullYear();
  const day = Number(dayPart);
  const month = months[monthPart.toLowerCase()];

  const timeMatch = cleanTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!timeMatch) return null;

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2] || "0");
  const ampm = timeMatch[3]?.toUpperCase();

  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  let parsed = new Date(year, month, day, hours, minutes, 0);

  // If the date already passed this year, use next year.
  if (parsed.getTime() < now.getTime()) {
    parsed = new Date(year + 1, month, day, hours, minutes, 0);
  }

  return parsed;
}
function Confirmation() {
  const navigate = useNavigate();
  const { draft, reset, update } = useBooking();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadIcs = async () => {
  setDownloading(true);
  setDownloadError(null);

  try {
    // First call backend /finalize-booking so the final booking payload is generated and saved.
    const result = await finalizeBooking(draft, draft.bookingId || undefined);

    if (result.status !== "ready_to_book") {
      setDownloadError(
        "Some required details are still missing: " + result.missing_fields.join(", "),
      );
      return;
    }

    update({ bookingId: result.booking_id });

    const start = parseAppointmentDate(draft.slotDate, draft.slotTime);

    if (!start) {
      setDownloadError("Couldn't create the calendar invite because the appointment date or time is missing.");
      return;
    }

    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const docsValue =
      draft.selectedDocuments.length > 0
        ? draft.selectedDocuments.map((d, i) => `${i + 1}. ${d.productTitle}`).join(" · ")
        : draft.product || "Notarity appointment";

    const description = [
      `Booking ID: ${result.booking_id}`,
      `Status: ${result.status}`,
      `Documents: ${docsValue}`,
      `Country of use: ${draft.countryOfUse || ""}`,
      `Appointment language: ${draft.appointmentLanguage || draft.language || "English"}`,
      `Participants: ${
        draft.participantsList.length > 0
          ? `${draft.participantsList.length} participant${draft.participantsList.length > 1 ? "s" : ""}`
          : draft.participants || "1 signer"
      }`,
      `Delivery method: ${draft.deliveryMethod || "Digital only (e-signed PDF)"}`,
      `Payment method: ${draft.billingMethod ? billingLabel(draft.billingMethod) : "Online payment"}`,
      `Notary: ${draft.notary || "Notarity notary"}`,
    ].join("\n");

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Notarity MVP//Appointment Booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:notarity-${result.booking_id}@notarity-mvp`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText("Notarity online notary appointment")}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `LOCATION:${escapeIcsText("Online video appointment")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "notarity-appointment.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloaded(true);
  } catch (err) {
    console.error(err);
    setDownloadError(
      "Couldn't finalize the booking or generate the calendar invite. Please make sure the backend is running and try again.",
    );
  } finally {
    setDownloading(false);
  }
};

  const slot =
    draft.slotDate && draft.slotTime
      ? `${draft.slotDate}, ${draft.slotTime}`
      : draft.slot || "Today 16:30";

  const docsValue =
    draft.selectedDocuments.length > 0
      ? draft.selectedDocuments.map((d, i) => `${i + 1}. ${d.productTitle}`).join(" · ")
      : draft.product || "Power of Attorney notarisation";

  const rows = [
    { icon: CheckCircle2, k: "Booking status", v: "Confirmed" },
    { icon: Calendar, k: "Date and time", v: `${slot} (${draft.timezone || "Europe/Vienna"})` },
    { icon: Video, k: "Documents", v: docsValue },
    { icon: Languages, k: "Appointment language", v: draft.appointmentLanguage || draft.language || "English" },
    {
      icon: Users,
      k: "Participants",
      v:
        draft.participantsList.length > 0
          ? `${draft.participantsList.length} participant${draft.participantsList.length > 1 ? "s" : ""}`
          : draft.participants || "1 signer",
    },
    { icon: Truck, k: "Delivery method", v: draft.deliveryMethod || "Digital only (e-signed PDF)" },
    { icon: CheckCircle2, k: "Payment method", v: draft.billingMethod ? billingLabel(draft.billingMethod) : "Online payment" },
    { icon: CheckCircle2, k: "Terms and Conditions", v: draft.termsAccepted ? "Accepted" : "Pending" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Appointment booked</h1>
        <p className="mt-2 text-muted-foreground">
          Your notary appointment has been successfully created. We sent the details to your email.
        </p>

        <Card className="mt-8 border-border text-left shadow-card">
          <CardContent className="divide-y divide-border p-0">
            {rows.map((r) => {
              const I = r.icon;
              return (
                <div key={r.k} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <I className="h-4 w-4 text-secondary" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{r.k}</div>
                    <div className="font-medium">{r.v}</div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="mt-4 border-border text-left shadow-card">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Add to calendar</div>
              <div className="text-sm text-muted-foreground">
                Save this appointment as an iCal calendar event.
              </div>
            </div>
            <Button
              onClick={handleDownloadIcs}
              disabled={downloading}
              className="bg-brand hover:bg-brand/90"
            >
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" /> Download iCal event
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {downloaded && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Calendar invite downloaded.
          </div>
        )}

        {downloadError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-left text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{downloadError}</span>
          </div>
        )}

        {draft.countryOfUse === "India" && draft.apostille === "no" && (
          <Card className="mt-4 border-warning/40 bg-warning/5 text-left shadow-card">
            <CardContent className="p-4 text-sm">
              <strong>Heads up:</strong> Documents used in India often require an apostille. You can add one
              from your dashboard after booking.
            </CardContent>
          </Card>
        )}

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              navigate({ to: "/" });
            }}
          >
            Book another appointment
          </Button>
          <Button
            onClick={() => {
              reset();
              navigate({ to: "/" });
            }}
            className="bg-brand hover:bg-brand/90"
          >
            Back to dashboard
          </Button>
        </div>
      </div>
    </AppShell>
  );
}