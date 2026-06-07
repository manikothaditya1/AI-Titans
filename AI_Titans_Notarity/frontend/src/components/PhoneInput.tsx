import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type PhoneCountry = {
  code: string; // dial code e.g. "+43"
  iso: string; // ISO2 e.g. "AT"
  name: string;
  flag: string; // emoji
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "+43", iso: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "+49", iso: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "+41", iso: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "+33", iso: "FR", name: "France", flag: "🇫🇷" },
  { code: "+39", iso: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "+34", iso: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "+31", iso: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "+32", iso: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "+44", iso: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+353", iso: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "+351", iso: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "+45", iso: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "+46", iso: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "+47", iso: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "+358", iso: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "+376", iso: "AD", name: "Andorra", flag: "🇦🇩" },
  { code: "+1", iso: "US", name: "United States", flag: "🇺🇸" },
  { code: "+1", iso: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "+52", iso: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "+55", iso: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "+91", iso: "IN", name: "India", flag: "🇮🇳" },
  { code: "+971", iso: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+92", iso: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "+86", iso: "CN", name: "China", flag: "🇨🇳" },
  { code: "+81", iso: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "+61", iso: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "+64", iso: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "+27", iso: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "+90", iso: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "+48", iso: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "+420", iso: "CZ", name: "Czechia", flag: "🇨🇿" },
];

function findCountry(code: string) {
  return PHONE_COUNTRIES.find((c) => c.code === code) ?? PHONE_COUNTRIES[0];
}

export function PhoneInput({
  countryCode,
  number,
  onCountryChange,
  onNumberChange,
  placeholder = "677 64781406",
}: {
  countryCode: string;
  number: string;
  onCountryChange: (code: string) => void;
  onNumberChange: (n: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = findCountry(countryCode || "+43");

  const filtered = PHONE_COUNTRIES.filter((c) => {
    const q = query.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.code.includes(q);
  });

  return (
    <div className="flex items-end gap-2 border-b border-border focus-within:border-secondary">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 pb-2 text-sm text-foreground"
          >
            <span className="text-base leading-none">{selected.flag}</span>
            <span className="font-medium">{selected.code}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country"
              className="w-full bg-transparent px-2 py-1 text-sm outline-none"
            />
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {filtered.map((c) => (
              <button
                key={`${c.iso}-${c.code}`}
                type="button"
                onClick={() => {
                  onCountryChange(c.code);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span>{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-muted-foreground">{c.code}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <input
        type="tel"
        value={number}
        onChange={(e) => onNumberChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent pb-2 text-sm outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}
