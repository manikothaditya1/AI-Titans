// Backend API client for the Notarity booking assistant.
// All network calls to the backend live here. The base URL comes from a public
// env variable (VITE_API_BASE_URL) and falls back to the local backend.
//
// Never call OpenAI / ChatGPT directly from the frontend — only this backend.

import { API_BASE_URL } from "./ai";
import type { BookingDraft } from "./booking-store";

export const MAX_FILES = 5;

// Shape returned per document by POST /analyze-documents.
export type AnalysedDocument = {
  documentId: string;
  fileName: string;
  detectedDocumentType: string;
  recommendedProduct: string;
  recommendedProductId: string;
  countryOfUse: string;
  signersDetected: number;
  language: string;
  confidence: number;
  extractedFields?: Record<string, unknown>;
  missingDetails: string[];
};

export type AutofillResponse = {
  hasDocument: boolean;
  product: string;
  documentType: string;
  documentLanguage: string;
  countryOfUse: string;
  participants: string;
  mode: string;
  apostille: string;
  deliveryMethod: string;
  billingMethod: string;
  appointmentLanguage: string;
  receivingAuthority: string;
};

export type AnalyzeResponse = {
  booking_id: string;
  files_count: number;
  analysed_documents: AnalysedDocument[];
  autofill: AutofillResponse;
  missing_questions: unknown[];
  status: string;
};

export type FinalizeResponse = {
  booking_id: string;
  status: "ready_to_book" | "missing_fields";
  missing_fields: string[];
  booking_payload: Record<string, unknown> | null;
};

export type AnalyzeInput = { id: string; fileName: string; file?: File | null };

// POST /analyze-documents — multipart form data, field name "files" (1-5 files).
export async function analyzeDocuments(files: AnalyzeInput[]): Promise<AnalyzeResponse> {
  const formData = new FormData();
  files.slice(0, MAX_FILES).forEach((f) => {
    if (f.file) {
      formData.append("files", f.file, f.fileName);
    } else {
      // Sample/demo entries without a real File still need a "files" part so the
      // backend can detect the document type from the file name.
      formData.append("files", new Blob([""], { type: "application/pdf" }), f.fileName);
    }
  });

  const res = await fetch(`${API_BASE_URL}/analyze-documents`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Failed to analyze documents (${res.status})`);
  return (await res.json()) as AnalyzeResponse;
}

// POST /finalize-booking — validates the current draft and returns the payload.
export async function finalizeBooking(
  draft: BookingDraft,
  bookingId?: string,
): Promise<FinalizeResponse> {
  const res = await fetch(`${API_BASE_URL}/finalize-booking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ booking_id: bookingId || null, draft }),
  });
  if (!res.ok) throw new Error(`Failed to finalize booking (${res.status})`);
  return (await res.json()) as FinalizeResponse;
}

// GET /download-booking/{id} — fetches the generated JSON and triggers a download.
export async function downloadBookingJson(bookingId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/download-booking/${bookingId}`);
  if (!res.ok) throw new Error(`Failed to download booking JSON (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notarity_booking_${bookingId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export type NotarityPriceLineItem = {
  name?: string;
  _product?: string;
  amount?: number;
  pricePerUnit?: number;
  net?: number;
  identifier?: number;
  pricingEnabled?: boolean;
};

export type NotarityPriceResponse = {
  status: "priced" | "missing_fields";
  missing_fields: string[];
  confirmedPrice: number | null;
  line_items: NotarityPriceLineItem[];
  pricing_warning?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function priceNotarityBooking(
  draft: BookingDraft,
  bookingId?: string,
): Promise<NotarityPriceResponse> {
  const res = await fetch(`${API_BASE_URL}/notarity/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ booking_id: bookingId || null, draft }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`Failed to price booking (${res.status}) ${message}`);
  }

  return (await res.json()) as NotarityPriceResponse;
}

export type SubmitAppointmentResponse = {
  status: "submitted" | "submission_failed" | "missing_fields";
  missing_fields?: string[];
  pricing_warning?: string | null;
  line_items?: NotarityPriceLineItem[];
  confirmedPrice?: number | null;
  payload?: Record<string, unknown> | null;
  submission?: {
    status_code: number;
    ok: boolean;
    response: unknown;
  } | null;
};

// POST /notarity/submit-appointment-request — builds the Notarity payload, attaches
// uploaded files, and POSTs to the real staging /appointment-requests endpoint.
export async function submitNotarityAppointment(
  draft: BookingDraft,
  bookingId?: string,
): Promise<SubmitAppointmentResponse> {
  const res = await fetch(`${API_BASE_URL}/notarity/submit-appointment-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ booking_id: bookingId || null, draft }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`Failed to submit appointment request (${res.status}) ${message}`);
  }

  return (await res.json()) as SubmitAppointmentResponse;
}