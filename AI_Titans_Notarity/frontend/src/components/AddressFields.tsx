import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const COUNTRY_LIST = [
  "Andorra",
  "Argentina",
  "Australia",
  "Austria",
  "Belgium",
  "Brazil",
  "Bulgaria",
  "Canada",
  "China",
  "Croatia",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hong Kong",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Latvia",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Mexico",
  "Netherlands",
  "New Zealand",
  "Norway",
  "Pakistan",
  "Philippines",
  "Poland",
  "Portugal",
  "Romania",
  "Saudi Arabia",
  "Serbia",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "South Africa",
  "South Korea",
  "Spain",
  "Sweden",
  "Switzerland",
  "Turkey",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
];

/**
 * Underline-style input used in the Notarity-look billing/contact form.
 */
export function UnderlineInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
        {optional && <span className="ml-1 text-muted-foreground/60">(optional)</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border-b border-border bg-transparent pb-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-secondary"
      />
    </label>
  );
}

export function UnderlineCountrySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = COUNTRY_LIST.filter((c) =>
    !query ? true : c.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between border-b border-border bg-transparent pb-2 text-left text-sm outline-none transition-colors focus:border-secondary"
          >
            <span className={value ? "text-foreground" : "text-muted-foreground/50"}>
              {value || "Select country"}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
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
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Check
                  className={["h-3.5 w-3.5", value === c ? "opacity-100" : "opacity-0"].join(" ")}
                />
                <span className="flex-1">{c}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </label>
  );
}
