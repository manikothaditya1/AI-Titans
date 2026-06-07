import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";

export type SearchableSelectProps = {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  allowOther?: boolean;
  otherLabel?: string;
  otherInputPlaceholder?: string;
};

const OTHER = "__other__";

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyMessage = "No matching option found.",
  allowOther = false,
  otherLabel = "Other / not listed",
  otherInputPlaceholder = "Please enter the details",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const isOther = allowOther && value !== "" && !options.includes(value);
  const [otherMode, setOtherMode] = useState(isOther);

  const display = isOther ? value || otherLabel : value || placeholder;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={[
              "flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition",
              value
                ? "border-secondary/50 ring-1 ring-secondary/20"
                : "border-border hover:border-secondary/40",
            ].join(" ")}
          >
            <span className={value ? "text-foreground" : "text-muted-foreground"}>{display}</span>
            <div className="flex items-center gap-1">
              {value && (
                <X
                  className="h-4 w-4 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                    setOtherMode(false);
                  }}
                />
              )}
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => {
                      onChange(opt);
                      setOtherMode(false);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={[
                        "mr-2 h-4 w-4",
                        value === opt ? "opacity-100" : "opacity-0",
                      ].join(" ")}
                    />
                    {opt}
                  </CommandItem>
                ))}
                {allowOther && (
                  <CommandItem
                    value={OTHER}
                    onSelect={() => {
                      setOtherMode(true);
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={["mr-2 h-4 w-4", otherMode ? "opacity-100" : "opacity-0"].join(" ")}
                    />
                    {otherLabel}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {allowOther && otherMode && (
        <Input
          autoFocus
          placeholder={otherInputPlaceholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
