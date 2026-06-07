import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useBooking, type SelectedDocument } from "@/lib/booking-store";
import {
  countryProductConfig,
  COUNTRIES,
  COUNTRY_OPTIONS,
  normalizeCountryName,
  type ProductOption,
} from "@/lib/ai";
import {
  ScrollText,
  PenLine,
  Copy,
  Building2,
  Home,
  HelpCircle,
  FileSignature,
  
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/product")({
  head: () => ({ meta: [{ title: "Choose country — Notarity" }] }),
  component: ProductPage,
});

const PRODUCT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  signature_notarisation: FileSignature,
  power_of_attorney: ScrollText,
  certified_true_copy: Copy,
  certified_copy: Copy,
  
  company_document_signature: PenLine,
  change_managing_director_gmbh: Building2,
  change_managing_director: Building2,
  change_registered_seat_gmbh: Building2,
  commercial_register_application: Building2,
  incorporation_flexco: Building2,
  incorporation_gmbh: Building2,
  general_partnership_og: Building2,
  letter_of_hypothecation: ScrollText,
  liquidation_gmbh: Building2,
  notarisation_for_ivf: FileSignature,
  real_estate_purchase_agreement: Home,
  transfer_of_shares_gmbh: Building2,
  other: HelpCircle,
};

function iconFor(id: string): React.ComponentType<{ className?: string }> {
  // Strip trailing country suffix (e.g. "_germany", "_austria").
  const base = id.replace(/_(germany|austria|india|spain|sweden|usa|uae|pakistan)$/i, "");
  return PRODUCT_ICONS[base] ?? PRODUCT_ICONS[id] ?? HelpCircle;
}

const MAX_DOCS = 5;

function ProductPage() {
  const navigate = useNavigate();
  const { draft, update } = useBooking();
  useEffect(() => {
  update({ hasDocument: false });
}, []);
  const [phase, setPhase] = useState<"country" | "document">(
    draft.countryOfUse ? "document" : "country",
  );
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const normalizedCountry = useMemo(
    () => normalizeCountryName(draft.countryOfUse),
    [draft.countryOfUse],
  );
  const countryConfig = countryProductConfig[normalizedCountry];
  const products: ProductOption[] = countryConfig?.products ?? [];
  const requiresAck = Boolean(countryConfig?.acknowledgement);

  useEffect(() => {
    if (phase !== "document") return;
    const key = "notarity_bot_nudged_product_doc";
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    const t = setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("notarity:nudge", {
          detail: {
            message:
              "Not sure which documents you need? Tell me what you want to do, and I'll help you choose.",
          },
        }),
      );
    }, 600);
    return () => clearTimeout(t);
  }, [phase]);

  const pickCountry = (c: string) => {
    update({ countryOfUse: c, product: "", documentType: "", selectedDocuments: [] });
    setAcknowledged(false);
    setPhase("document");
  };

  const isSelected = (productId: string) =>
    draft.selectedDocuments.some((d) => d.productId === productId);

  const toggleProduct = (product: ProductOption) => {
    setLimitMsg(null);
    const existing = draft.selectedDocuments;
    if (existing.some((d) => d.productId === product.id)) {
      const next = existing.filter((d) => d.productId !== product.id);
      update({
        selectedDocuments: next,
        product: next[0]?.productTitle ?? "",
        documentType: next[0]?.productTitle ?? "",
      });
      return;
    }
    if (existing.length >= MAX_DOCS) {
      setLimitMsg(
        "You can upload up to 5 documents in one booking. Please remove one document before adding another.",
      );
      return;
    }
    const newDoc: SelectedDocument = {
      id: `doc_${existing.length + 1}_${Date.now()}`,
      productId: product.id,
      productTitle: product.title,
      destinationCountry: normalizedCountry,
      addOns: product.addOns,
      answers: {},
    };
    const next = [...existing, newDoc];
    update({
      selectedDocuments: next,
      product: next[0].productTitle,
      documentType: next[0].productTitle,
    });
  };

  const removeDoc = (id: string) => {
    const next = draft.selectedDocuments.filter((d) => d.id !== id);
    update({
      selectedDocuments: next,
      product: next[0]?.productTitle ?? "",
      documentType: next[0]?.productTitle ?? "",
    });
    setLimitMsg(null);
  };

  const continueToQuestions = () => {
    if (draft.selectedDocuments.length === 0) return;
    navigate({ to: "/questions" });
  };

  if (phase === "country") {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h1 className="text-3xl font-semibold tracking-tight">
            In which country do you want to notarise the document?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Choose the country where the document will be submitted or accepted — not your citizenship.
          </p>

          <div className="mt-6">
            <SearchableSelect
              options={COUNTRY_OPTIONS}
              value={draft.countryOfUse}
              onChange={(v) => v && pickCountry(v)}
              placeholder="Search all countries"
              searchPlaceholder="Type a country name..."
              emptyMessage="No matching country found. Please check the spelling."
            />
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COUNTRIES.map((c, idx) => {
              const active = draft.countryOfUse === c.name;
              return (
                <button
                  key={c.name}
                  onClick={() => pickCountry(c.name)}
                  style={{ animationDelay: `${idx * 40}ms` }}
                  className={[
                    "group flex items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-card transition-all duration-200",
                    "animate-in fade-in slide-in-from-bottom-1",
                    "hover:-translate-y-0.5 hover:shadow-elevated",
                    active
                      ? "border-secondary ring-2 ring-secondary/30"
                      : "border-border hover:border-secondary/40",
                  ].join(" ")}
                >
                  <span className="text-2xl" aria-hidden>
                    {c.flag}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Notarise for use in {c.name}
                    </div>
                  </div>
                  {active ? (
                    <Check className="h-4 w-4 text-secondary" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-secondary" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const selectedCount = draft.selectedDocuments.length;
  const isGermany = normalizedCountry === "Germany";
  const canContinue = selectedCount > 0 && (!requiresAck || acknowledged);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          Notarising for use in <span className="font-medium text-foreground">{normalizedCountry}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Which document do you need to notarise?
          </h1>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("notarity:open", {
                  detail: {
                    message: `Tell me what you want to do with the document, and I'll help you choose the right appointment type for ${normalizedCountry}.`,
                  },
                }),
              )
            }
            className="shrink-0 rounded-full border border-secondary/40 bg-card px-3 py-1.5 text-xs font-medium text-secondary transition hover:border-secondary hover:bg-secondary/10"
          >
            Not sure? Ask the assistant
          </button>
        </div>
        <p className="mt-2 text-muted-foreground">
          These are the documents available for {normalizedCountry}. Pick the closest match.
        </p>
        {isGermany && (
          <p className="mt-2 text-sm text-muted-foreground">
            Some German-use documents require an apostille because the certification is not issued by a
            German notary.
          </p>
        )}

        {!countryConfig ? (
          <div className="mt-8 rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-warning" />
              <div>
                <div className="font-medium">No products configured for {draft.countryOfUse}</div>
                <p className="mt-1 text-muted-foreground">
                  Product list for this country is not available in the demo yet. Please choose another
                  country or ask the assistant.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {products.map((p, idx) => {
              const Icon = iconFor(p.id);
              const active = isSelected(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProduct(p)}
                  style={{ animationDelay: `${idx * 40}ms` }}
                  className={[
                    "group relative flex items-start gap-3 rounded-xl border p-4 text-left shadow-card transition-all duration-200",
                    "animate-in fade-in slide-in-from-bottom-1",
                    "hover:-translate-y-0.5 hover:shadow-elevated",
                    active
                      ? "border-secondary bg-secondary/5 ring-2 ring-secondary/20"
                      : "border-border bg-card hover:border-secondary/40",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-secondary/15" : "bg-muted",
                    ].join(" ")}
                  >
                    <Icon className="h-5 w-5 text-secondary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      {p.title}
                      {active && (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{p.description}</div>
                    {p.addOns && p.addOns.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.addOns.map((a) => {
                          const isRecommended = /\(recommended\)/i.test(a);
                          const label = isRecommended ? "Apostille recommended" : a;
                          return (
                            <span
                              key={a}
                              className={[
                                "rounded-full border px-2 py-0.5 text-[11px]",
                                isRecommended
                                  ? "border-secondary/40 bg-secondary/10 text-secondary"
                                  : "border-border bg-muted text-foreground/80",
                              ].join(" ")}
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {active && (
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const existing = draft.selectedDocuments.find((d) => d.productId === p.id);
                          if (existing) removeDoc(existing.id);
                        }}
                        className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-secondary underline-offset-2 hover:underline"
                      >
                        Remove
                      </span>
                    )}
                  </div>
                  {!active && (
                    <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-secondary" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {limitMsg && (
          <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
            {limitMsg}
          </div>
        )}

        {countryConfig && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Selected documents
            </div>
            {selectedCount === 0 ? (
              <div className="mt-2 text-sm text-muted-foreground">No documents selected yet.</div>
            ) : (
              <ol className="mt-3 space-y-2">
                {draft.selectedDocuments.map((d, i) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="mr-2 font-medium text-muted-foreground">{i + 1}.</span>
                      {d.productTitle}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDoc(d.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" /> Remove
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedCount} of {MAX_DOCS} documents selected
            </div>
          </div>
        )}

        {requiresAck && countryConfig && (
          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-secondary/30 bg-secondary/5 p-4 text-sm">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(Boolean(v))}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{countryConfig.acknowledgement}.</span>
              <span className="ml-1 text-muted-foreground">
                Required to continue with a {normalizedCountry}-use document.
              </span>
            </span>
          </label>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              update({ countryOfUse: "", selectedDocuments: [] });
              setAcknowledged(false);
              setPhase("country");
            }}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Change country
          </Button>
          <Button
            onClick={continueToQuestions}
            disabled={!canContinue}
            className="bg-brand hover:bg-brand/90"
          >
            Continue with selected documents
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
