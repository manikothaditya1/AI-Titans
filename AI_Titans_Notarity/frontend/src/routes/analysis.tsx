import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, AlertCircle, Sparkles, FileText } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SummaryPanel } from "@/components/SummaryPanel";
import { useBooking } from "@/lib/booking-store";

export const Route = createFileRoute("/analysis")({
  head: () => ({ meta: [{ title: "Analysis — Notarity" }] }),
  component: Analysis,
});

function Analysis() {
  const navigate = useNavigate();
  const { draft } = useBooking();

  const analysed = draft.analysedDocuments ?? [];
  const isMulti = analysed.length > 1;
  const isSingle = analysed.length === 1;

  const singleDetected = [
    {
      label: "Document type",
      value: analysed[0]?.detectedDocumentType || draft.documentType || "Signature Notarisation",
    },
    {
      label: "Recommended product",
      value: analysed[0]?.recommendedProduct || draft.product || "Signature Notarisation",
    },
    {
      label: "Country of use",
      value: analysed[0]?.countryOfUse || draft.countryOfUse || "Austria",
    },
    {
      label: "Signers detected",
      value: analysed[0]
        ? `${analysed[0].signersDetected} signer${analysed[0].signersDetected === 1 ? "" : "s"}`
        : draft.participants || "1 signer",
    },
    {
      label: "Language",
      value: analysed[0]?.language || draft.documentLanguage || "German or English",
    },
    {
      label: "Confidence",
      value: analysed[0] ? `${Math.round(analysed[0].confidence * 100)}%` : "92%",
    },
  ];

  const missing = analysed[0]?.missingDetails?.length
    ? analysed[0].missingDetails
    : ["Delivery method", "Billing method", "Appointment slot", "Consents"];

  return (
    <AppShell right={<SummaryPanel />}>
      <div className="flex items-center gap-2">
        <Badge className="bg-accent text-accent-foreground hover:bg-accent">
          <Sparkles className="mr-1 h-3 w-3" /> AI analysis complete
        </Badge>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {isMulti ? `We analysed ${analysed.length} documents` : "We found the main details"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {isMulti
          ? "Each document was analysed separately. Review the detected types and recommended products."
          : "Confirm what we detected, then answer the few remaining questions."}
      </p>

      {isMulti ? (
        <div className="mt-6 space-y-4">
          <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Detected documents
          </div>
          {analysed.map((doc, idx) => (
            <Card key={doc.documentId} className="border-border shadow-card">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
                    <FileText className="h-5 w-5 text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold">Document {idx + 1}</div>
                      <Badge variant="outline" className="text-xs">
                        {Math.round(doc.confidence * 100)}% confidence
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">{doc.fileName}</div>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Field label="Detected type" value={doc.detectedDocumentType} />
                      <Field label="Recommended product" value={doc.recommendedProduct} />
                      <Field label="Country of use" value={doc.countryOfUse} />
                      <Field
                        label="Signers detected"
                        value={`${doc.signersDetected} signer${doc.signersDetected === 1 ? "" : "s"}`}
                      />
                    </dl>
                    {doc.missingDetails.length > 0 && (
                      <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
                        <span className="font-medium">Still needed: </span>
                        {doc.missingDetails.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <Card className="mt-6 border-border shadow-card">
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              {singleDetected.map((d) => (
                <div
                  key={d.label}
                  className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {d.label}
                    </div>
                    <div className="font-medium">{d.value}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mt-6 border-warning/40 bg-warning/5 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-warning" />
                <div className="flex-1">
                  <div className="font-medium">Still needed ({missing.length})</div>
                  <ul className="mt-2 grid grid-cols-1 gap-1 text-sm text-foreground sm:grid-cols-2">
                    {missing.map((m) => (
                      <li key={m} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate({ to: "/upload" })}>
          Back
        </Button>
        <Button onClick={() => navigate({ to: "/questions" })} className="bg-brand hover:bg-brand/90">
          {isSingle || analysed.length === 0
            ? "Answer missing questions"
            : "Continue with these documents"}
        </Button>
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
