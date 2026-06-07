import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SummaryPanel } from "@/components/SummaryPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { TimeSlotPicker } from "@/components/TimeSlotPicker";
import {
  useBooking,
  type BookingDraft,
  type Participant,
  type SelectedDocument,
} from "@/lib/booking-store";
import { COUNTRY_OPTIONS, countryProductConfig, normalizeCountryName, getProductsForCountry } from "@/lib/ai";
import { Info, Sparkles, ArrowLeft, ArrowRight, Plus, Trash2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/questions")({
  head: () => ({ meta: [{ title: "A few details — Notarity" }] }),
  component: QuestionsPage,
});

type Patch = Parameters<ReturnType<typeof useBooking>["update"]>[0];

type Question = {
  id: string;
  title: string;
  helper: string;
  why: string;
  render: (draft: BookingDraft, update: (p: Patch) => void) => React.ReactNode;
  isAnswered: (d: BookingDraft) => boolean;
  canContinue?: boolean;
  appliesTo?: (d: BookingDraft) => boolean;
};

function Option({ value, label, selected }: { value: string; label: string; selected: boolean }) {
  return (
    <label
      className={[
        "flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition",
        selected ? "border-secondary ring-2 ring-secondary/30" : "border-border hover:bg-muted/40",
      ].join(" ")}
    >
      <RadioGroupItem value={value} />
      <span className="text-sm">{label}</span>
    </label>
  );
}

const BILLING_OPTIONS: { value: string; title: string }[] = [
  { value: "online_payment", title: "Online payment" },
  { value: "pay_at_appointment", title: "Pay at appointment" },
];

const MAX_PARTICIPANTS = 5;

// Per-product question schema
type DocQuestion = { key: string; label: string; placeholder?: string; options?: string[] };
const CONFIGURED_PRODUCT_IDS = new Set(
  Object.values(countryProductConfig).flatMap((entry) =>
    entry.products.flatMap((product) => [product.id, baseProductKey(product.id)]),
  ),
);

// Product configs do not define custom intake questions in this MVP flow.
// Configured products skip directly to add-ons / participants / appointment.
const DOC_QUESTIONS: Record<string, DocQuestion[]> = {};

// Strip country suffix from product IDs like "change_managing_director_gmbh_austria".
function baseProductKey(productId: string): string {
  return productId.replace(
    /_(germany|austria|india|spain|sweden|usa|uae|pakistan)$/i,
    "",
  );
}

function isApostilleRecommended(draft: BookingDraft): boolean {
  const country = normalizeCountryName(draft.countryOfUse);
  const products = getProductsForCountry(country);
  const selectedIds = new Set(draft.selectedDocuments.map((d) => d.productId));
  return products.some(
    (p) => selectedIds.has(p.id) && p.addOns?.some((a) => a.includes("(recommended)")),
  );
}

function otherProductQuestions(): DocQuestion[] {
  return [
    { key: "docPurpose", label: "What is this document for?", placeholder: "Briefly describe" },
    { key: "docLanguage", label: "What language is the document in?", placeholder: "e.g. English" },
  ];
}

function questionsForProduct(productId: string): DocQuestion[] {
  const base = baseProductKey(productId);
  if (DOC_QUESTIONS[base]) return DOC_QUESTIONS[base];
  if (base === "other") return otherProductQuestions();
  if (CONFIGURED_PRODUCT_IDS.has(productId) || CONFIGURED_PRODUCT_IDS.has(base)) return [];
  return otherProductQuestions();
}

function setDocAnswer(
  draft: BookingDraft,
  update: (p: Patch) => void,
  docId: string,
  key: string,
  value: string,
) {
  const next: SelectedDocument[] = draft.selectedDocuments.map((d) =>
    d.id === docId ? { ...d, answers: { ...d.answers, [key]: value } } : d,
  );
  update({ selectedDocuments: next });
}

function QuestionsPage() {
  const navigate = useNavigate();
  const { draft, update } = useBooking();
  const [tcOpen, setTcOpen] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);

  // Per-document questions step list — only include docs that actually have questions.
  const docQuestionSteps = useMemo<Question[]>(() => {
    const docs = draft.selectedDocuments;
    return docs
      .map((doc, idx) => ({ doc, idx, schema: questionsForProduct(doc.productId) }))
      .filter(({ schema }) => schema.length > 0)
      .map(({ doc, idx, schema }): Question => {
        return {
          id: `doc_${doc.id}`,
          title: doc.productTitle,
          helper: `Document ${idx + 1} of ${docs.length}: ${doc.productTitle}`,
          why: "These details help the notary prepare for your appointment.",
          isAnswered: (d) => {
            const found = d.selectedDocuments.find((x) => x.id === doc.id);
            if (!found) return true;
            return schema.every((q) => Boolean((found.answers[q.key] ?? "").trim()));
          },
          render: (d, u) => {
            const current = d.selectedDocuments.find((x) => x.id === doc.id);
            return (
              <div className="grid gap-4">
                <div className="rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-xs font-medium text-secondary w-fit">
                  Document {idx + 1} of {docs.length}: {doc.productTitle}
                </div>
                {schema.map((q) => (
                  <div key={q.key} className="grid gap-1.5">
                    <Label className="text-sm font-medium">{q.label}</Label>
                    {q.options ? (
                      <RadioGroup
                        value={current?.answers[q.key] ?? ""}
                        onValueChange={(value) => setDocAnswer(d, u, doc.id, q.key, value)}
                        className="grid gap-2"
                      >
                        {q.options.map((option) => (
                          <Option
                            key={option}
                            value={option}
                            label={option}
                            selected={(current?.answers[q.key] ?? "") === option}
                          />
                        ))}
                      </RadioGroup>
                    ) : (
                      <Input
                        value={current?.answers[q.key] ?? ""}
                        placeholder={q.placeholder}
                        onChange={(e) => setDocAnswer(d, u, doc.id, q.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            );
          },
        };
      });
  }, [draft.selectedDocuments]);


  const sharedQuestions = useMemo<Question[]>(
    () => [
      {
        id: "country",
        title: "Where will the document be used?",
        helper: "Choose the country where the document will be submitted or accepted, not your citizenship.",
        why: "Different countries have different acceptance rules and may require an apostille.",
        isAnswered: (d) => Boolean(d.countryOfUse),
        render: (d, u) => (
          <SearchableSelect
            options={COUNTRY_OPTIONS}
            value={d.countryOfUse}
            onChange={(v) => u({ countryOfUse: v })}
            placeholder="Select a country"
            searchPlaceholder="Search country..."
            emptyMessage="No matching country found. Please check the spelling."
          />
        ),
      },
      {
        id: "apostille",
        title: "Do you need an apostille?",
        helper: "An apostille helps a notarised document be accepted in another country.",
        why: "Most documents used abroad need this extra certification.",
        isAnswered: (d) => Boolean(d.apostille),
        render: (d, u) => {
          const recommended = isApostilleRecommended(d);
          const yesLabel = recommended ? "Yes, add apostille (recommended)" : "Yes, add apostille";
          return (
            <RadioGroup value={d.apostille} onValueChange={(v) => u({ apostille: v })} className="grid gap-2">
              <Option value="yes" label={yesLabel} selected={d.apostille === "yes"} />
              <Option value="no" label="No apostille needed" selected={d.apostille === "no"} />
            </RadioGroup>
          );
        },
      },
      {
        id: "delivery",
        title: "How should we deliver the notarised document?",
        helper: "Choose a physical copy if the receiving authority asks for originals.",
        why: "Foreign authorities and apostilles usually need a physical copy.",
        isAnswered: (d) => Boolean(d.deliveryMethod),
        render: (d, u) => (
          <RadioGroup value={d.deliveryMethod} onValueChange={(v) => u({ deliveryMethod: v })} className="grid gap-2">
            {["Digital only (e-signed PDF)", "Physical copy by post", "Both digital and physical"].map((c) => (
              <Option key={c} value={c} label={c} selected={d.deliveryMethod === c} />
            ))}
          </RadioGroup>
        ),
      },
      {
        id: "billing",
        title: "How would you like to pay?",
        helper: "",
        why: "Payment information is needed before the appointment can be booked.",
        isAnswered: (d) => Boolean(d.billingMethod),
        render: (d, u) => (
          <RadioGroup
            value={d.billingMethod}
            onValueChange={(v) => u({ billingMethod: v })}
            className="grid gap-3"
          >
            {BILLING_OPTIONS.map((o) => {
              const selected = d.billingMethod === o.value;
              return (
                <label
                  key={o.value}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition",
                    selected
                      ? "border-secondary bg-secondary/5 ring-2 ring-secondary/20"
                      : "border-border bg-card hover:border-secondary/40 hover:bg-muted/30",
                  ].join(" ")}
                >
                  <RadioGroupItem value={o.value} />
                  <div className="font-semibold text-foreground">{o.title}</div>
                </label>
              );
            })}
          </RadioGroup>
        ),
      },
      {
        id: "appointmentLanguage",
        title: "Which language should the appointment be in?",
        helper: "Choose the language you prefer for the video appointment.",
        why: "The notary will conduct the appointment in this language.",
        isAnswered: (d) => Boolean(d.appointmentLanguage),
        render: (d, u) => (
          <RadioGroup
            value={d.appointmentLanguage}
            onValueChange={(v) => u({ appointmentLanguage: v, language: v })}
            className="grid gap-2 sm:grid-cols-3"
          >
            {["German", "English", "Spanish"].map((c) => (
              <Option key={c} value={c} label={c} selected={d.appointmentLanguage === c} />
            ))}
          </RadioGroup>
        ),
      },
      {
        id: "participants",
        title: "Participants",
        helper:
          "Please enter the email address for you and any additional participants. Every person who signs must verify their identity before the appointment.",
        why: "We use participant emails to send identity verification and appointment links.",
        isAnswered: (d) => {
          const list = d.participantsList;
          if (list.length === 0) return false;
          const main = list[0];
          if (!main.email.trim() || !/^\S+@\S+\.\S+$/.test(main.email)) return false;
          return list.every((p) => /^\S+@\S+\.\S+$/.test(p.email));
        },
        render: (d, u) => {
          const list: Participant[] =
            d.participantsList.length > 0
              ? d.participantsList
              : [
                  {
                    id: "p_main",
                    email: "",
                    role: "signer",
                    needsToSign: true,
                  },
                ];

          const setList = (next: Participant[]) => u({ participantsList: next });

          const update = (id: string, patch: Partial<Participant>) =>
            setList(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

          const addOne = () => {
            setParticipantsError(null);
            if (list.length >= MAX_PARTICIPANTS) {
              setParticipantsError("You can add up to 5 participants for this demo booking.");
              return;
            }
            setList([
              ...list,
              {
                id: `p_${list.length + 1}_${Date.now()}`,
                email: "",
                role: "signer",
                needsToSign: true,
              },
            ]);
          };

          const remove = (id: string) => {
            if (list.length === 1) return;
            setList(list.filter((p) => p.id !== id));
          };

          return (
            <div className="grid gap-4">
              {list.map((p, i) => (
                <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {i === 0 ? "Main participant" : `Participant ${i + 1}`}
                    </div>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Email address</Label>
                      <Input
                        type="email"
                        value={p.email}
                        placeholder="name@example.com"
                        onChange={(e) => update(p.id, { email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <select
                        value={p.role}
                        onChange={(e) =>
                          update(p.id, {
                            role: e.target.value as Participant["role"],
                            needsToSign:
                              (e.target.value as Participant["role"]) === "viewer"
                                ? false
                                : p.needsToSign,
                          })
                        }
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="signer">Signer</option>
                        <option value="viewer">Viewer / advisor</option>
                        <option value="company_representative">Company representative</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={p.needsToSign}
                          onCheckedChange={(v) => update(p.id, { needsToSign: Boolean(v) })}
                          disabled={p.role === "viewer"}
                        />
                        This person needs to sign
                      </label>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addOne}
                className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-border bg-card px-3 py-2 text-sm font-medium text-secondary hover:border-secondary"
              >
                <Plus className="h-4 w-4" /> Add another participant
              </button>

              {participantsError && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                  {participantsError}
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                <p>
                  Every person who signs on one or more documents has to verify their identity. Without
                  verification, the signature cannot be notarised. If someone only needs to observe the
                  meeting, mark them as viewer/advisor.
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: "slot",
        title: "Choose a date",
        helper: "Pick a date and time that works for you. Times are shown in the selected timezone.",
        why: "Your notary will be booked for this time window.",
        isAnswered: (d) => Boolean(d.slotDate && d.slotTime),
        render: (d, u) => (
          <TimeSlotPicker
            value={{ date: d.slotDate, time: d.slotTime }}
            timezone={d.timezone}
            onTimezoneChange={(tz) => u({ timezone: tz })}
            onChange={(s) =>
              u({
                slotDate: s.date,
                slotTime: s.time,
                slot: s.label,
                mode: "Online video appointment",
                notary: "Dr. Sophia Berger",
              })
            }
          />
        ),
      },
     {
  id: "consents",
  title: "Consents and Terms",
  helper: "Please review and accept the following to continue with your online notary appointment.",
  why: "These confirmations are legally required before an online notarisation can be booked.",
  isAnswered: (d) => d.termsAccepted,
  render: (d, u) => (
    <div className="grid gap-3">
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/40">
        <Checkbox
          checked={d.termsAccepted}
          onCheckedChange={(v) => u({ termsAccepted: Boolean(v) })}
        />
        <span className="text-sm">
          I accept the{" "}
          <button
            type="button"
            onClick={() => setTcOpen(true)}
            className="inline font-medium text-secondary underline hover:text-secondary/80"
          >
            Terms and Conditions
          </button>{" "}
          and confirm that the information provided is correct.
        </span>
      </label>
    </div>
  ),
},
    ],
    [],
  );

  const allQuestions = useMemo(
    () => [...docQuestionSteps, ...sharedQuestions],
    [docQuestionSteps, sharedQuestions],
  );

  const activeQuestions = useMemo(
    () =>
      allQuestions.filter((q) => {
        if (q.id === "country" && draft.countryOfUse) return false;
        if (q.appliesTo && !q.appliesTo(draft)) return false;
        return true;
      }),
    [allQuestions, draft],
  );

  const [i, setI] = useState(() => {
  const firstUnanswered = activeQuestions.findIndex((q) => !q.isAnswered(draft));
  return firstUnanswered < 0 ? activeQuestions.length - 1 : firstUnanswered;
});

  const safeIndex = Math.min(Math.max(i, 0), Math.max(activeQuestions.length - 1, 0));
  const q = activeQuestions[safeIndex];
  if (!q) {
    return (
      <AppShell>
        <p className="text-muted-foreground">No questions yet — please select a document first.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/product" })}>
          Back to documents
        </Button>
      </AppShell>
    );
  }
  const answered = q.isAnswered(draft);
  const canContinue = answered || q.canContinue;
  const progress = ((safeIndex + (canContinue ? 1 : 0)) / activeQuestions.length) * 100;

  const timeLeft = useMemo(() => {
    const remaining = activeQuestions.length - safeIndex;
    if (remaining <= 1) return "Almost done";
    if (remaining <= 3) return "Avg. time left: 1 min";
    return "Avg. time left: 2 min";
  }, [safeIndex, activeQuestions.length]);

  const next = () => {
    if (!canContinue) return;
    if (safeIndex === activeQuestions.length - 1) {
      navigate({ to: "/validation" });
    } else {
      setI(safeIndex + 1);
    }
  };
  const prev = () => {
    if (safeIndex === 0) navigate({ to: draft.hasDocument ? "/analysis" : "/product" });
    else setI(safeIndex - 1);
  };

  return (
    <AppShell right={<SummaryPanel />}>
      <div>
        <div className="flex items-center gap-3">
          <Progress value={progress} className="h-2 flex-1" />
          <span className="text-xs font-medium text-muted-foreground">{timeLeft}</span>
        </div>

        <Card className="mt-6 border-border shadow-card">
          <CardContent className="space-y-5 p-6">
            <div>
              <Label className="text-2xl font-semibold tracking-tight text-foreground">{q.title}</Label>
              <p className="mt-1 text-sm text-muted-foreground">{q.helper}</p>
            </div>

            <div>{q.render(draft, update)}</div>

            <details className="group rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <summary className="flex cursor-pointer items-center gap-2 text-secondary">
                <Info className="h-4 w-4" /> Why this matters
              </summary>
              <p className="mt-2 text-muted-foreground">{q.why}</p>
            </details>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={prev}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <Button onClick={next} disabled={!canContinue} className="bg-brand hover:bg-brand/90">
            {safeIndex === activeQuestions.length - 1 ? "Check booking" : "Next"}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          The assistant adapts these questions to your selected products and country.
        </div>

        <Dialog open={tcOpen} onOpenChange={setTcOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Terms and Conditions</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    By continuing, you confirm that the information you provided is correct, that you agree to the online notary appointment process, and that identity verification and data processing may be required to complete the appointment.
                  </p>
                  <p>This demo does not create a real booking or charge your card.</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button onClick={() => setTcOpen(false)}>I understand</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
