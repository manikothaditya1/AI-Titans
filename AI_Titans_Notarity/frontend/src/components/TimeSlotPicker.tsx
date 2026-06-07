import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Globe, Check, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

type Props = {
  value?: { date: string; time: string };
  onChange: (next: { date: string; time: string; iso: string; label: string }) => void;
  timezone?: string;
  onTimezoneChange?: (tz: string) => void;
};

const HOUR_BLOCKS = [
  "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM",
  "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM",
];

const fallbackTimezones = [
  "Europe/Vienna","Europe/Berlin","Europe/Stockholm","Europe/London","Europe/Paris",
  "Europe/Madrid","Europe/Rome","Europe/Zurich","Europe/Amsterdam","Europe/Brussels",
  "Europe/Warsaw","Europe/Prague","Europe/Budapest","Europe/Istanbul",
  "Asia/Kolkata","Asia/Dubai","Asia/Karachi","Asia/Singapore","Asia/Bangkok",
  "Asia/Tokyo","Asia/Seoul","Asia/Hong_Kong","Asia/Shanghai","Asia/Riyadh","Asia/Qatar",
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "America/Toronto","America/Vancouver","America/Mexico_City","America/Sao_Paulo",
  "America/Bogota","America/Lima","America/Argentina/Buenos_Aires",
  "Africa/Abidjan","Africa/Accra","Africa/Addis_Ababa","Africa/Algiers","Africa/Cairo",
  "Africa/Casablanca","Africa/Johannesburg","Africa/Lagos","Africa/Nairobi",
  "Australia/Sydney","Australia/Melbourne","Australia/Perth","Pacific/Auckland",
];

const ALL_TIMEZONES: string[] =
  typeof (Intl as any).supportedValuesOf === "function"
    ? (Intl as any).supportedValuesOf("timeZone")
    : fallbackTimezones;

function isHourUnavailable(dateKey: string, time: string): boolean {
  const h = (dateKey + time).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  if (time === "7:00 AM" || time === "8:00 PM") return true;
  if (h % 7 === 0) return true;
  return false;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtShort(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

function fmtLong(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function fmtRange(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "short", year: "numeric" };
  return `${start.toLocaleDateString("en-GB", opts)} – ${end.toLocaleDateString("en-GB", opts)}`;
}

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseHourLabel(hourLabel: string): { hour24: number } {
  const m = hourLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return { hour24: 0 };
  let hour = parseInt(m[1], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return { hour24: hour };
}

function nextHour(hourLabel: string): string {
  const { hour24 } = parseHourLabel(hourLabel);
  const h = (hour24 + 1) % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${ampm}`;
}

function generateTenMinuteSlotsForHour(hourLabel: string): string[] {
  const match = hourLabel.match(/(\d{1,2}):00\s?(AM|PM)/i);
  if (!match) return [];
  const hour = Number(match[1]);
  const period = match[2].toUpperCase();
  return [0, 10, 20, 30, 40, 50].map((m) => {
    return `${hour}:${String(m).padStart(2, "0")} ${period}`;
  });
}

function TimezoneCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_TIMEZONES;
    return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q));
  }, [query]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/40"
        >
          <Globe className="h-4 w-4 text-secondary" />
          <span className="text-muted-foreground">Timezone:</span>
          <span className="font-medium text-foreground">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[300px] p-0 pointer-events-auto"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search timezone..."
            className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No matching timezone found
            </div>
          ) : (
            filtered.map((tz) => {
              const selected = tz === value;
              return (
                <button
                  key={tz}
                  type="button"
                  onClick={() => {
                    onChange(tz);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={[
                    "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition",
                    selected
                      ? "bg-brand/10 text-brand font-medium"
                      : "hover:bg-muted/60 text-foreground",
                  ].join(" ")}
                >
                  <span>{tz}</span>
                  {selected && <Check className="h-4 w-4 text-brand" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TimeSlotPicker({ value, onChange, timezone = "Europe/Vienna", onTimezoneChange }: Props) {
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [modal, setModal] = useState<{ date: Date; hour: string } | null>(null);

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [anchor]);

  const rangeLabel = fmtRange(days[0], days[days.length - 1]);

  const pick = (d: Date, time: string) => {
    const dateLabel = fmtShort(d);
    onChange({
      date: dateLabel,
      time,
      iso: d.toISOString(),
      label: `${dateLabel}, ${time}`,
    });
    setModal(null);
  };

  const selectedHourBase = value?.time ? value.time.replace(/:\d{2}\s*/, ":00 ") : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimezoneCombobox
          value={timezone}
          onChange={(tz) => onTimezoneChange?.(tz)}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const d = new Date(anchor);
              d.setDate(anchor.getDate() - 6);
              setAnchor(d);
            }}
            className="rounded-lg border border-border bg-card p-2 hover:bg-muted"
            aria-label="Previous dates"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
            {rangeLabel}
          </div>
          <button
            type="button"
            onClick={() => {
              const d = new Date(anchor);
              d.setDate(anchor.getDate() + 6);
              setAnchor(d);
            }}
            className="rounded-lg border border-border bg-card p-2 hover:bg-muted"
            aria-label="Next dates"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-6 gap-2">
          {days.map((d) => {
            const key = dateKey(d);
            const isSelectedDay = value?.date === fmtShort(d);
            return (
              <div key={key} className="rounded-xl border border-border bg-card p-2">
                <div className="mb-2 border-b border-border pb-2 text-center text-xs font-semibold text-foreground">
                  {fmtShort(d)}
                </div>
                <div className="flex flex-col gap-1.5">
                  {HOUR_BLOCKS.map((t) => {
                    const disabled = isHourUnavailable(key, t);
                    const selected = isSelectedDay && selectedHourBase === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={disabled}
                        onClick={() => setModal({ date: d, hour: t })}
                        className={[
                          "rounded-md px-2 py-1.5 text-xs font-medium transition",
                          disabled
                            ? "cursor-not-allowed bg-muted/40 text-muted-foreground/50 line-through"
                            : selected
                              ? "bg-brand text-brand-foreground shadow-card"
                              : "border border-border bg-background text-foreground hover:border-brand hover:bg-brand/10 hover:text-brand",
                        ].join(" ")}
                      >
                        {selected && value?.time ? value.time : t}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="sm:max-w-md">
          {modal && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {fmtLong(modal.date)} {modal.hour} – {nextHour(modal.hour)}
                </DialogTitle>
                <DialogDescription>
                  Choose the exact 10-minute appointment slot inside this hour.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2 pt-2">
                {generateTenMinuteSlotsForHour(modal.hour).map((slot) => {
                  const selected =
                    value?.date === fmtShort(modal.date) && value?.time === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => pick(modal.date, slot)}
                      className={[
                        "rounded-md px-2 py-2 text-sm font-medium transition",
                        selected
                          ? "bg-brand text-brand-foreground"
                          : "border border-border bg-background text-foreground hover:border-brand hover:bg-brand/10 hover:text-brand",
                      ].join(" ")}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
