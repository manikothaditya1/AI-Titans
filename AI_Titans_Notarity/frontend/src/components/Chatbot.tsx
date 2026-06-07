import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBooking } from "@/lib/booking-store";
import {
  countryProductConfig,
  normalizeCountryName,
  type ProductOption,
} from "@/lib/ai";

type Msg = { role: "user" | "bot"; text: string };

type Ctx = {
  pathname: string;
  country: string;
  product: string;
  hasDocument: boolean | null;
};

// ---- Knowledge base ---------------------------------------------------------
import faqData from "@/data/notary_registration_chatbot_faq.json";

type Faq = { intent: string; questions: string[]; answer: string };

const notaryFAQ: Faq[] = (faqData as { faqs: Faq[] }).faqs ?? [];
const jsonFallback: Faq | undefined = (faqData as { fallback?: Faq }).fallback;

const legalValidityKeywords = [
  "legally valid",
  "legal validity",
  "is this valid",
  "is my document valid",
  "legally binding",
  "can you check if my document is valid",
  "can you give legal advice",
  "can you review my contract",
  "can you explain what i am signing",
];

const legalSafetyAnswer =
  "I can help with the booking setup, but I cannot confirm legal validity. Please check with the receiving authority or ask the notary.";

const vagueFallbackKeywords = [
  "need stamp",
  "need notary",
  "for embassy",
  "for bank",
  "for pakistan",
  "for visa",
  "need legal paper",
  "need paper",
  "stamp",
];

const vagueFallback =
  "I can help choose the right notary service. Tell me what the document is, where it will be used, and whether you need a signature certified, a copy certified, or an apostille. If you upload the document, I can help detect the likely document type.";

const defaultFallback =
  "I can help with notary appointments, document type selection, uploads, identity verification, signature certification, certified copies, apostille, payment, and delivery. Please describe what you need to do with the document, or upload it so I can help identify the right appointment type.";

const STOPWORDS = new Set([
  "document", "documents", "notary", "notaries", "appointment", "appointments",
  "choose", "help", "service", "services", "legal", "upload", "booking",
  "page", "type", "types", "need", "needs", "want", "wants", "can", "what",
  "how", "do", "does", "is", "are", "the", "a", "an", "i", "my", "me", "to",
  "for", "of", "on", "in", "and", "or", "with", "this", "that", "you", "your",
  "should", "would", "could", "it", "be", "have", "has", "will", "please",
  "am", "was", "were", "if", "so", "any", "some", "from", "at", "by", "as",
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulWords(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function formatProductList(products: ProductOption[]): string {
  return products.map((p, i) => `${i + 1}. ${p.title}`).join("\n");
}

function countryProductAnswer(textRaw: string, ctx: Ctx): string | null {
  const nt = normalizeText(textRaw);
  const mentionsList =
    /\b(what|which|show|list|available|options|products|choose|pick)\b/.test(nt);
  if (!mentionsList && !nt.includes("for ")) return null;

  // Detect explicit country mention in the user message.
  let target: string | null = null;
  for (const name of Object.keys(countryProductConfig)) {
    const n = normalizeText(name);
    if (nt.includes(n)) {
      target = name;
      break;
    }
  }
  if (!target) {
    if (nt.includes("usa") || nt.includes("america")) target = "United States of America";
    else if (nt.includes("uae") || nt.includes("emirates")) target = "United Arab Emirates";
  }

  // Fall back to selected country only if the user asks a generic listing question.
  if (!target && mentionsList && ctx.country) {
    const normalized = normalizeCountryName(ctx.country);
    if (countryProductConfig[normalized]) target = normalized;
  }
  if (!target) return null;

  const cfg = countryProductConfig[target];
  if (!cfg) {
    return `Product list for ${target} is not available in this demo. Please choose another country or ask about a different one.`;
  }
  return `Here are the documents available for ${target}:\n${formatProductList(cfg.products)}`;
}

function unavailableProductAnswer(textRaw: string, ctx: Ctx): string | null {
  if (!ctx.country) return null;
  const normalized = normalizeCountryName(ctx.country);
  const cfg = countryProductConfig[normalized];
  if (!cfg) return null;
  const nt = normalizeText(textRaw);
  const knownProductTerms = [
    "power of attorney",
    "real estate",
    "ivf",
    "incorporation",
    "transfer of shares",
    "general partnership",
    "managing director",
    "commercial register",
    "letter of hypothecation",
    "liquidation",
  ];
  const mentioned = knownProductTerms.find((t) => nt.includes(t));
  if (!mentioned) return null;
  const available = cfg.products.some((p) => normalizeText(p.title).includes(mentioned));
  if (available) return null;
  return `That product is not listed for ${normalized} in this demo. Please choose one of the available options shown on the page:\n${formatProductList(cfg.products)}`;
}

function answerFor(textRaw: string, ctx: Ctx): string {
  const nt = normalizeText(textRaw);
  if (!nt) return defaultFallback;

  if (legalValidityKeywords.some((k) => nt.includes(normalizeText(k)))) return legalSafetyAnswer;

  const countryAns = countryProductAnswer(textRaw, ctx);
  if (countryAns) return countryAns;

  const unavailable = unavailableProductAnswer(textRaw, ctx);
  if (unavailable) return unavailable;

  // Priority 1: exact normalized question match.
  // Priority 2: user input contains the full normalized question (must have >=2 meaningful words).
  // Priority 3: question contained inside user input as a phrase, or strong keyword overlap (>=2 meaningful words shared).
  const userNorm = nt;
  const userWords = new Set(meaningfulWords(textRaw));

  let exact: Faq | null = null;
  let contains: { faq: Faq; len: number } | null = null;
  let keyword: { faq: Faq; score: number } | null = null;

  for (const faq of notaryFAQ) {
    for (const q of faq.questions) {
      const qNorm = normalizeText(q);
      if (!qNorm) continue;
      const qWords = meaningfulWords(q);

      if (qNorm === userNorm) {
        exact = faq;
        break;
      }
      if (qWords.length >= 2 && userNorm.includes(qNorm)) {
        const len = qNorm.length;
        if (!contains || len > contains.len) contains = { faq, len };
        continue;
      }
      if (qWords.length >= 2) {
        const shared = qWords.filter((w) => userWords.has(w)).length;
        if (shared >= 2 && shared >= Math.ceil(qWords.length / 2)) {
          if (!keyword || shared > keyword.score) keyword = { faq, score: shared };
        }
      }
    }
    if (exact) break;
  }

  if (exact) return exact.answer;
  if (contains) return contains.faq.answer;
  if (keyword) return keyword.faq.answer;

  if (vagueFallbackKeywords.some((k) => nt.includes(normalizeText(k)))) return vagueFallback;
  if (nt.split(/\s+/).filter((w) => w.length > 2).length <= 2) return vagueFallback;

  return jsonFallback?.answer ?? defaultFallback;
}

// ---- Suggestion chips -------------------------------------------------------
const DEFAULT_CHIPS = [
  "What does a notary do?",
  "Which document should I choose?",
  "What is signature notarisation?",
  "What is apostille?",
  "Do I need ID?",
  "Can I upload my document?",
  "How much does it cost?",
  "I need human support",
];

const ROUTE_SUGGESTIONS: Record<string, string[]> = {
  "/": ["What does a notary do?", "Which document should I choose?", "What is apostille?"],
  "/upload": ["Can I upload my document?", "Is my document safe?", "Is my scan readable?"],
  "/analysis": ["Wrong document?", "What is notarisation?"],
  "/product": [
    "Which document should I choose?",
    "What is signature notarisation?",
    "Power of attorney?",
    "Certified copy?",
  ],
  "/questions": ["What is apostille?", "Do I need ID?", "How do I pay?", "Can I book online?"],
  "/validation": ["Is online notarisation valid?", "What is notarisation?"],
  "/review": ["Can I edit later?", "How do I pay?"],
  "/payment": ["Pay at appointment?", "Can my company pay?"],
  "/confirmation": ["How do I reschedule?", "I need human support"],
};

export function Chatbot() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { draft } = useBooking();
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "bot",
      text: "Hi, I'm the Notarity Assistant. Ask anything about this step — I'll keep it simple.",
    },
  ]);
  const [input, setInput] = useState("");
  const teaserDismissedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const ctx: Ctx = useMemo(
    () => ({
      pathname,
      country: normalizeCountryName(draft.countryOfUse),
      product: draft.product,
      hasDocument: draft.hasDocument,
    }),
    [pathname, draft.countryOfUse, draft.product, draft.hasDocument],
  );

  const suggestions = useMemo(
    () => ROUTE_SUGGESTIONS[pathname] ?? DEFAULT_CHIPS,
    [pathname],
  );

  useEffect(() => {
    const onNudge = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      const msg = detail?.message ?? "Need a hand picking the right option?";
      if (open) {
        setMessages((m) => [...m, { role: "bot", text: msg }]);
      } else if (!teaserDismissedRef.current) {
        setTeaser(msg);
        setMessages((m) => (m.some((x) => x.text === msg) ? m : [...m, { role: "bot", text: msg }]));
      }
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setOpen(true);
      setTeaser(null);
      if (detail?.message) {
        setMessages((m) =>
          m.some((x) => x.text === detail.message) ? m : [...m, { role: "bot", text: detail.message! }],
        );
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener("notarity:nudge", onNudge as EventListener);
    window.addEventListener("notarity:open", onOpen as EventListener);
    return () => {
      window.removeEventListener("notarity:nudge", onNudge as EventListener);
      window.removeEventListener("notarity:open", onOpen as EventListener);
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const reply = (q: string) => {
    const a = answerFor(q, ctx);
    setMessages((m) => [...m, { role: "user", text: q }, { role: "bot", text: a }]);
  };

  const send = () => {
    const v = input.trim();
    if (!v) return;
    setInput("");
    reply(v);
  };

  const openChat = () => {
    setOpen(true);
    setTeaser(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const dismissTeaser = () => {
    setTeaser(null);
    teaserDismissedRef.current = true;
  };

  return (
    <>
      {!open && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
          {teaser && (
            <div className="relative max-w-[280px] animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-border bg-card p-3 pr-8 text-sm shadow-elevated">
              <button
                onClick={dismissTeaser}
                aria-label="Dismiss"
                className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-secondary">
                <Sparkles className="h-3 w-3" /> Notarity Assistant
              </div>
              <p className="text-foreground">{teaser}</p>
              <button
                onClick={openChat}
                className="mt-2 text-xs font-medium text-secondary hover:underline"
              >
                Open chat →
              </button>
            </div>
          )}
          <button
            onClick={openChat}
            className="relative flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-medium text-brand-foreground shadow-elevated transition hover:opacity-90"
          >
            <MessageCircle className="h-4 w-4" />
            Need help?
            {teaser && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
              </span>
            )}
          </button>
        </div>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[520px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-elevated animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between border-b border-border bg-brand px-4 py-3 text-brand-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <div>
                <div className="text-sm font-semibold">Notarity Assistant</div>
                <div className="text-[11px] opacity-70">Helps you book the right appointment</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/40 p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={[
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                  m.role === "bot"
                    ? "bg-card text-foreground shadow-card"
                    : "ml-auto bg-secondary text-secondary-foreground",
                ].join(" ")}
              >
                {m.text}
              </div>
            ))}
            <div className="pt-2">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Suggested</div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => reply(q)}
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground hover:border-secondary hover:text-secondary"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-border bg-card p-3"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this step..."
              className="h-9"
            />
            <Button type="submit" size="sm" className="h-9">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
