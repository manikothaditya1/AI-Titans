import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UploadCloud, FileText, Sparkles, Loader2, X, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useBooking } from "@/lib/booking-store";
import { analyzeDocuments } from "@/lib/booking-api";

export const Route = createFileRoute("/upload")({
  head: () => ({ meta: [{ title: "Upload documents — Notarity" }] }),
  component: UploadPage,
});

const MAX_FILES = 5;
const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg";

type Pending = {
  id: string;
  file: File | null;
  fileName: string;
  size: number;
  ext: string;
};

function extOf(name: string) {
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  return (m?.[1] ?? "FILE").toUpperCase();
}

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function UploadPage() {
  const navigate = useNavigate();
  const { update } = useBooking();
  useEffect(() => {
  update({ hasDocument: true });
}, []);
  const [docs, setDocs] = useState<Pending[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (files: File[]) => {
    setLimitMsg(null);
    setDocs((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (files.length > remaining) {
        setLimitMsg(
          "You can upload up to 5 documents in one booking. Please remove one document before adding another.",
        );
      }
      const toAdd = files.slice(0, Math.max(0, remaining)).map((f, i) => ({
        id: `doc_${Date.now()}_${prev.length + i + 1}`,
        file: f,
        fileName: f.name,
        size: f.size,
        ext: extOf(f.name),
      }));
      return [...prev, ...toAdd];
    });
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) addFiles(files);
  };

  const removeDoc = (id: string) => {
    setDocs((p) => p.filter((d) => d.id !== id));
    setLimitMsg(null);
  };

  const useSample = () => {
    setLimitMsg(null);
    setDocs([
      {
        id: `doc_${Date.now()}_s1`,
        file: null,
        fileName: "Signature_Notarisation_sample.pdf",
        size: 184_320,
        ext: "PDF",
      },
      {
        id: `doc_${Date.now()}_s2`,
        file: null,
        fileName: "Power_of_Attorney_sample.pdf",
        size: 212_992,
        ext: "PDF",
      },
    ]);
  };

  const analyze = async () => {
    if (docs.length === 0) return;
    setAnalyzing(true);
    setLimitMsg(null);
    try {
      const result = await analyzeDocuments(
        docs.map((d) => ({ id: d.id, fileName: d.fileName, file: d.file })),
      );
      const analysed = result.analysed_documents;

      const selectedDocuments = analysed.map((a) => ({
        id: a.documentId,
        productId: a.recommendedProductId,
        productTitle: a.recommendedProduct,
        fileName: a.fileName,
        detectedDocumentType: a.detectedDocumentType,
        answers: {},
      }));

      const first = analysed[0];
      const af = result.autofill;
      // Backend detection pre-fills document/product/country/language only.
      // Booking preferences (apostille, delivery, payment, appointment language)
      // remain explicit customer choices and are still asked on /questions.
      update({
        bookingId: result.booking_id,
        analysedDocuments: analysed,
        selectedDocuments,
        product: af?.product || first?.recommendedProduct || "",
        documentType: af?.documentType || first?.detectedDocumentType || "",
        documentLanguage: af?.documentLanguage || first?.language || "",
        countryOfUse: af?.countryOfUse || first?.countryOfUse || "",
        participants:
          af?.participants ||
          (first
            ? `${first.signersDetected} signer${first.signersDetected === 1 ? "" : "s"}`
            : ""),
        signer1: "You",
      });
      navigate({ to: "/analysis" });
    } catch (err) {
      console.error(err);
      setLimitMsg(
        "We couldn't reach the analysis service. Please make sure the backend is running and try again.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const ctaLabel = analyzing
    ? "Analyzing..."
    : docs.length > 1
    ? "Analyze documents"
    : "Analyze document";

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Upload your documents</h1>
        <p className="mt-2 text-muted-foreground">
          Upload up to 5 PDF, Word, or image files. Each document can be analysed separately.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={[
            "mt-8 rounded-2xl border-2 border-dashed bg-card p-10 text-center shadow-card transition",
            dragOver ? "border-secondary bg-secondary/5" : "border-border",
          ].join(" ")}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <UploadCloud className="h-6 w-6 text-secondary" />
          </div>
          <p className="mt-4 font-medium">Drop up to 5 PDF, Word, or image files here</p>
          <p className="text-sm text-muted-foreground">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={onFileInput}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={docs.length >= MAX_FILES}
            className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Browse files
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            {docs.length} of {MAX_FILES} files selected
          </p>
        </div>

        {limitMsg && (
          <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            {limitMsg}
          </div>
        )}

        {docs.length > 0 && (
          <ol className="mt-4 space-y-2">
            {docs.map((d, i) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card"
              >
                <span className="text-sm font-medium text-muted-foreground">{i + 1}.</span>
                <FileText className="h-5 w-5 shrink-0 text-secondary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.fileName}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/80">
                      {d.ext}
                    </span>
                    <span>{formatSize(d.size)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-secondary">
                      <CheckCircle2 className="h-3 w-3" /> Ready to analyse
                    </span>
                  </div>
                </div>
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

        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-accent" />
            <div className="flex-1">
              <div className="font-medium">No document handy?</div>
              <div className="text-sm text-muted-foreground">
                Use sample documents to try the full flow.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={useSample}>
              Use sample documents
            </Button>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
            Back
          </Button>
          <Button
            onClick={analyze}
            disabled={docs.length === 0 || analyzing}
            className="bg-brand hover:bg-brand/90"
          >
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {ctaLabel}
              </>
            ) : (
              ctaLabel
            )}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
