"""
Notarity document-first booking assistant - backend API.

Endpoints
---------
GET  /health                -> backend status
POST /analyze-documents     -> multipart upload (field name: "files", max 5),
                               reads docs, extracts info, recommends product,
                               returns a frontend-friendly autofill payload.
POST /finalize-booking      -> validates the booking draft, builds the final
                               payload, returns ready_to_book / missing_fields.
GET  /download-booking/{id} -> returns the generated booking JSON as a download.

Design notes
------------
* The OpenAI key is optional. If it is missing OR the AI call fails, the backend
  falls back to a deterministic, rule-based extraction so the demo never breaks.
* Unsupported / unreadable files never crash the request - they degrade gracefully.
* Generated JSON is written to ./data so it can be downloaded later.
"""

from typing import List, Optional, Any, Dict, Tuple
from pathlib import Path
from io import BytesIO
import os
import re
import json
import uuid

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing_extensions import Annotated

# --- Optional dependencies (imported defensively so the app boots without them) ---
try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover
    PdfReader = None  # type: ignore

try:
    import docx  # python-docx
except Exception:  # pragma: no cover
    docx = None  # type: ignore

try:
    from dotenv import load_dotenv
    for _candidate in (".env", "passcodes &api keys/.env"):
        if Path(_candidate).exists():
            load_dotenv(_candidate)
            break
except Exception:  # pragma: no cover
    pass

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore


# --------------------------- Config ---------------------------
API_KEY = os.getenv("OPENAI_API_KEY")
MODEL_NAME = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")

_openai_client = None
if API_KEY and OpenAI is not None:
    try:
        _openai_client = OpenAI(api_key=API_KEY)
    except Exception:
        _openai_client = None

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

MAX_FILES = 5

app = FastAPI(title="Notarity Booking Assistant API", version="1.0.0")

# Allow the local frontend (and Lovable preview) to call the local backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------- Product catalogue ---------------------------
PRODUCTS = {
    "signature_notarisation": "Signature Notarisation / Signature certification",
    "power_of_attorney": "Power of Attorney notarisation",
    "certified_true_copy": "Certified true copy",
    "company_document_signature": "Company document signature",
    "general_notary_appointment": "General notary appointment",
}

# Document-type detection keywords -> (document_type, product_id)
DOC_TYPE_RULES = [
    ("power_of_attorney", "power_of_attorney",
     ["power of attorney", "poa", "attorney-in-fact", "attorney in fact", "grantor", "donor and attorney"]),
    ("certified_true_copy", "certified_true_copy",
     ["certified true copy", "certified copy", "true copy", "copy matches the original"]),
    ("company_document_signature", "company_document_signature",
     ["gmbh", "incorporation", "articles of association", "shareholder", "managing director", "commercial register"]),
    ("signature_notarisation", "signature_notarisation",
     ["signature", "notarisation", "notarization", "certify your signature", "sign in the presence"]),
]

COUNTRIES = [
    "Austria", "Germany", "India", "Spain", "Sweden", "Pakistan",
    "United Arab Emirates", "United States of America", "United States",
    "United Kingdom", "Switzerland", "France", "Italy", "Netherlands",
    "Portugal", "Ireland", "Canada", "Australia", "Singapore",
]

LANGUAGE_HINTS = {
    "German": ["der ", "und ", "vollmacht", "unterschrift", "gmbh", "osterreich"],
    "Spanish": ["el ", "la ", "poder notarial", "firma", "espana"],
}


# --------------------------- Text extraction ---------------------------
def extract_text_from_pdf(file_bytes: bytes) -> str:
    if PdfReader is None:
        return ""
    text = ""
    try:
        reader = PdfReader(BytesIO(file_bytes))
        for page in reader.pages:
            text += page.extract_text() or ""
    except Exception:
        text = ""
    return text


def extract_text_from_docx(file_bytes: bytes) -> str:
    if docx is None:
        return ""
    text = ""
    try:
        document = docx.Document(BytesIO(file_bytes))
        text = "\n".join(p.text for p in document.paragraphs)
    except Exception:
        text = ""
    return text


def extract_text(filename: str, file_bytes: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes)
    if name.endswith(".docx"):
        return extract_text_from_docx(file_bytes)
    if name.endswith((".txt", ".md")):
        try:
            return file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            return ""
    # Images / unsupported types: graceful fallback (no OCR implemented).
    return ""


# --------------------------- Heuristic extraction (always-available fallback) ---------------------------
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
DATE_RE = re.compile(
    r"\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b"
)
COMPANY_RE = re.compile(r"\b([A-Z][\w&.\- ]+?(?:GmbH|Ltd|LLC|Inc|AG|PLC|LLP|Pvt\.? Ltd))\b")

def detect_document_type(text: str, filename: str) -> Tuple[str, str]:
    haystack = re.sub(r"[_\-./]+", " ", ("%s %s" % (filename, text)).lower())

    for doc_type, product_id, keywords in DOC_TYPE_RULES:
        if any(k in haystack for k in keywords):
            return doc_type, product_id

    return "unknown", "general_notary_appointment"


def detect_country(text: str, filename: str) -> str:
    low = re.sub(r"[_\-./]+", " ", ("%s %s" % (filename, text)).lower())

    for country in COUNTRIES:
        if country.lower() in low:
            if country == "United States":
                return "United States of America"
            return country

    return ""


def detect_language(text: str) -> str:
    low = text.lower()
    for lang, hints in LANGUAGE_HINTS.items():
        if sum(1 for h in hints if h in low) >= 2:
            return lang
    return "English"


def detect_signers(text: str, doc_type: str) -> int:
    if doc_type == "power_of_attorney":
        return 2
    emails = len(set(EMAIL_RE.findall(text)))
    return max(1, min(5, emails or 1))


def heuristic_extract(text: str, filename: str) -> Dict[str, Any]:
    doc_type, product_id = detect_document_type(text, filename)
    names: List[str] = []
    for m in re.finditer(r"(?:name|grantor|signed by|applicant)[:\s]+([A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+)", text):
        if m.group(1) not in names:
            names.append(m.group(1))
    return {
        "documentType": doc_type,
        "recommendedProductId": product_id,
        "recommendedProduct": PRODUCTS.get(product_id, PRODUCTS["general_notary_appointment"]),
        "countryOfUse": detect_country(text, filename),
        "language": detect_language(text),
        "signersDetected": detect_signers(text, doc_type),
        "names": names[:5],
        "emails": list(dict.fromkeys(EMAIL_RE.findall(text)))[:5],
        "companies": list(dict.fromkeys(COMPANY_RE.findall(text)))[:5],
        "dates": list(dict.fromkeys(DATE_RE.findall(text)))[:5],
    }


def _clean_json(raw: str) -> Dict[str, Any]:
    raw = raw.strip()

    if raw.startswith("```json"):
        raw = raw.replace("```json", "", 1).strip()
    elif raw.startswith("```"):
        raw = raw.replace("```", "", 1).strip()

    if raw.endswith("```"):
        raw = raw[:-3].strip()

    start = raw.find("{")
    end = raw.rfind("}")

    if start != -1 and end != -1:
        raw = raw[start:end + 1]

    return json.loads(raw)


def normalise_product_id(value: Any) -> Optional[str]:
    if not value:
        return None

    value_low = str(value).strip().lower()

    if value_low in PRODUCTS:
        return value_low

    for product_id, label in PRODUCTS.items():
        if value_low == label.lower():
            return product_id

    aliases = {
        "power of attorney": "power_of_attorney",
        "poa": "power_of_attorney",
        "signature": "signature_notarisation",
        "signature notarisation": "signature_notarisation",
        "signature notarization": "signature_notarisation",
        "certified true copy": "certified_true_copy",
        "certified copy": "certified_true_copy",
        "company": "company_document_signature",
        "managing director": "company_document_signature",
        "gmbh": "company_document_signature",
    }

    for alias, product_id in aliases.items():
        if alias in value_low:
            return product_id

    return None


def ai_refine(text: str, filename: str, base: Dict[str, Any]) -> Dict[str, Any]:
    if _openai_client is None or not text.strip():
        return base

    prompt = f"""
You are Notary Navigator AI.

You will receive one uploaded document for a notary booking flow.

Your task:
Extract the information needed to autofill the frontend form.

Return ONLY valid JSON.
Do not include markdown.
Do not include explanations.
Do not include extra fields.

Allowed documentType values:
- power_of_attorney
- signature_notarisation
- certified_true_copy
- company_document_signature
- unknown

Allowed recommendedProductId values:
{json.dumps(list(PRODUCTS.keys()), indent=2)}

Product catalogue:
{json.dumps(PRODUCTS, indent=2)}

Required JSON format:
{{
  "documentType": "string",
  "recommendedProductId": "string",
  "recommendedProduct": "string",
  "countryOfUse": "string or null",
  "language": "string or null",
  "signersDetected": number,
  "names": [],
  "emails": [],
  "companies": [],
  "dates": []
}}

Rules:
- Do not guess the country of use.
- Do not use nationality or address as country of use unless the text clearly says the document is for use there.
- If country of use is unclear, return null.
- If document type is unclear, return "unknown" and use "general_notary_appointment".
- Choose the best Notarity product from the product catalogue.

Filename:
{filename}

Document text:
{text[:8000]}
"""

    try:
        resp = _openai_client.responses.create(
            model=MODEL_NAME,
            input=prompt,
        )

        data = _clean_json(resp.output_text)
        merged = dict(base)

        if data.get("documentType"):
            merged["documentType"] = data["documentType"]

        product_id = normalise_product_id(data.get("recommendedProductId") or data.get("recommendedProduct"))

        if product_id:
            merged["recommendedProductId"] = product_id
            merged["recommendedProduct"] = PRODUCTS[product_id]

        if data.get("countryOfUse"):
            merged["countryOfUse"] = data["countryOfUse"]

        if data.get("language"):
            merged["language"] = data["language"]

        if isinstance(data.get("signersDetected"), int):
            merged["signersDetected"] = max(1, min(5, data["signersDetected"]))

        for key in ("names", "emails", "companies", "dates"):
            if isinstance(data.get(key), list):
                merged[key] = data[key][:5]

        return merged

    except Exception:
        return base


# --------------------------- Analysis payload ---------------------------
DEFAULT_MISSING_DETAILS = [
    "Apostille decision", "Delivery method", "Billing method",
    "Appointment language", "Appointment slot", "Consents",
]


def build_analysed_document(filename: str, text: str) -> Dict[str, Any]:
    base = heuristic_extract(text, filename)
    refined = ai_refine(text, filename, base)

    confidence = 0.9 if text.strip() and refined["documentType"] != "unknown" else 0.4

    return {
        "documentId": uuid.uuid4().hex,
        "fileName": filename,
        "detectedDocumentType": refined["documentType"],
        "recommendedProduct": refined["recommendedProduct"],
        "recommendedProductId": refined["recommendedProductId"],
        "countryOfUse": refined["countryOfUse"],
        "signersDetected": refined["signersDetected"],
        "language": refined["language"],
        "confidence": confidence,
        "extractedFields": {
            "names": refined["names"],
            "emails": refined["emails"],
            "companies": refined["companies"],
            "addresses": [],
            "dates": refined["dates"],
            "documentPurpose": None,
            "receivingAuthority": None,
        },
        "missingDetails": list(DEFAULT_MISSING_DETAILS),
    }


def build_autofill(analysed: List[Dict[str, Any]]) -> Dict[str, Any]:
    first = analysed[0] if analysed else None
    signers = first["signersDetected"] if first else 1

    return {
        "hasDocument": True,
        "product": first["recommendedProduct"] if first else "",
        "recommendedProductId": first["recommendedProductId"] if first else "",
        "documentType": first["detectedDocumentType"] if first else "",
        "documentLanguage": first["language"] if first else "",
        "countryOfUse": first["countryOfUse"] if first else "",
        "participants": "%d signer%s" % (signers, "" if signers == 1 else "s"),

        # These must stay empty so the frontend does NOT skip the questions.
        "mode": "Online video appointment",
        "apostille": "",
        "deliveryMethod": "",
        "billingMethod": "",
        "appointmentLanguage": "",
        "receivingAuthority": "",
    }

MISSING_QUESTIONS = [
    {
        "id": "apostille",
        "field": "apostille",
        "question": "Do you need an apostille for this document?",
        "type": "select",
        "options": ["Yes", "No"]
    },
    {
        "id": "deliveryMethod",
        "field": "deliveryMethod",
        "question": "How should we deliver the notarised document?",
        "type": "select",
        "options": [
            "Digital only",
            "Physical copy by post",
            "Both digital and physical"
        ]
    },
    {
        "id": "billingMethod",
        "field": "billingMethod",
        "question": "How would you like to pay?",
        "type": "select",
        "options": [
            "Online payment",
            "Pay at appointment"
        ]
    },
    {
        "id": "appointmentLanguage",
        "field": "appointmentLanguage",
        "question": "What language should the appointment be in?",
        "type": "select",
        "options": [
            "English",
            "German"
        ]
    },
    {
        "id": "participantEmails",
        "field": "participantEmails",
        "question": "Do you want to add email addresses for other participants?",
        "type": "email_list",
        "maxItems": 5
    }
]


# --------------------------- Routes ---------------------------
@app.get("/")
def root():
    return {"message": "Notarity backend is running.", "docs": "/docs"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "ai_enabled": _openai_client is not None,
        "pdf_support": PdfReader is not None,
        "docx_support": docx is not None,
        "max_files": MAX_FILES,
    }


@app.post("/analyze-documents", openapi_extra={
    "requestBody": {
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "files": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "format": "binary"
                            },
                            "description": "Upload 1-5 documents"
                        }
                    },
                    "required": ["files"]
                }
            }
        }
    }
})
async def analyze_documents(
    files: Annotated[List[UploadFile], File(description="Upload 1-5 documents")]
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded. Use the 'files' field.")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail="Maximum %d files allowed." % MAX_FILES)

    booking_id = uuid.uuid4().hex
    analysed: List[Dict[str, Any]] = []

    for file in files:
        if not file.filename:
            continue
        original = Path(file.filename).name
        try:
            file_bytes = await file.read()
        except Exception:
            file_bytes = b""
        try:
            (UPLOAD_DIR / ("%s_%s" % (booking_id, original))).write_bytes(file_bytes)
        except Exception:
            pass
        try:
            text = extract_text(original, file_bytes)
        except Exception:
            text = ""
        analysed.append(build_analysed_document(original, text))

    if not analysed:
        raise HTTPException(status_code=400, detail="No valid files could be processed.")

    response = {
        "booking_id": booking_id,
        "files_count": len(analysed),
        "analysed_documents": analysed,
        "autofill": build_autofill(analysed),
        "missing_questions": MISSING_QUESTIONS,
        "status": "analysis_complete",
    }
    try:
        (DATA_DIR / ("%s_analysis.json" % booking_id)).write_text(json.dumps(response, indent=2), encoding="utf-8")
    except Exception:
        pass
    return response


# ----- Finalize booking -----
class FinalizeRequest(BaseModel):
    booking_id: Optional[str] = None
    draft: Dict[str, Any]


def _is_email(value: Any) -> bool:
    return isinstance(value, str) and bool(EMAIL_RE.fullmatch(value.strip()))


def _details_valid(d: Any) -> bool:
    if not isinstance(d, dict):
        return False
    required = ["firstName", "lastName", "email", "street", "city", "zipCode", "country"]
    if not all(str(d.get(k, "")).strip() for k in required):
        return False
    return _is_email(d.get("email", ""))


def validate_draft(draft: Dict[str, Any]) -> List[str]:
    missing: List[str] = []

    if not str(draft.get("countryOfUse", "")).strip():
        missing.append("countryOfUse")

    selected_docs = draft.get("selectedDocuments") or []
    if not selected_docs and not str(draft.get("product", "")).strip():
        missing.append("product")

    participants = draft.get("participantsList") or []
    if not participants:
        missing.append("participants")
    else:
        if not _is_email(participants[0].get("email", "")):
            missing.append("participantEmail")
        if len(participants) > 1 and not all(_is_email(p.get("email", "")) for p in participants):
            missing.append("participantEmails")

    if not str(draft.get("mode", "")).strip():
        missing.append("mode")
    if not (str(draft.get("slotDate", "")).strip() and str(draft.get("slotTime", "")).strip()):
        missing.append("appointmentSlot")
    if not str(draft.get("appointmentLanguage", "") or draft.get("language", "")).strip():
        missing.append("appointmentLanguage")
    if not str(draft.get("apostille", "")).strip():
        missing.append("apostille")
    if not str(draft.get("deliveryMethod", "")).strip():
        missing.append("deliveryMethod")
    if not str(draft.get("billingMethod", "")).strip():
        missing.append("billingMethod")

    if not _details_valid(draft.get("billingDetails")):
        missing.append("billingDetails")

    if not draft.get("sameContactAsBilling", False) and not _details_valid(draft.get("contactDetails")):
        missing.append("contactDetails")

    if not draft.get("termsAccepted"):
        missing.append("termsAccepted")

    return missing


def build_booking_payload(booking_id: str, draft: Dict[str, Any]) -> Dict[str, Any]:
    participants = draft.get("participantsList") or []
    return {
        "booking_id": booking_id,
        "countryOfUse": draft.get("countryOfUse", ""),
        "product": draft.get("product", ""),
        "documentType": draft.get("documentType", ""),
        "documentLanguage": draft.get("documentLanguage", ""),
        "selectedDocuments": draft.get("selectedDocuments", []),
        "apostille": draft.get("apostille", ""),
        "appointment": {
            "mode": draft.get("mode", ""),
            "date": draft.get("slotDate", ""),
            "time": draft.get("slotTime", ""),
            "timezone": draft.get("timezone", ""),
            "language": draft.get("appointmentLanguage", "") or draft.get("language", ""),
            "notary": draft.get("notary", ""),
        },
        "delivery": {
            "method": draft.get("deliveryMethod", ""),
            "shippingAddress": draft.get("shippingAddress", ""),
        },
        "billing": {
            "method": draft.get("billingMethod", ""),
            "details": draft.get("billingDetails", {}),
        },
        "contact": {
            "sameAsBilling": draft.get("sameContactAsBilling", False),
            "details": draft.get("contactDetails", {}),
        },
        "participants": [
            {"email": p.get("email", ""), "role": p.get("role", ""), "needsToSign": p.get("needsToSign", False)}
            for p in participants
        ],
        "consents": draft.get("consents", {}),
        "termsAccepted": draft.get("termsAccepted", False),
        "status": "ready_to_book",
    }


@app.post("/finalize-booking")
def finalize_booking(req: FinalizeRequest):
    booking_id = req.booking_id or uuid.uuid4().hex
    draft = req.draft or {}

    missing = validate_draft(draft)
    if missing:
        return {
            "booking_id": booking_id,
            "status": "missing_fields",
            "missing_fields": missing,
            "booking_payload": None,
        }

    payload = build_booking_payload(booking_id, draft)

    # Add the official-style Notarity appointment request payload from the same draft.
    # If staging is unavailable, keep the demo working and store the warning instead.
    try:
        notarity_payload = build_notarity_appointment_request_payload(booking_id, draft)
        line_items, confirmed_price, pricing_warning = price_notarity_appointment_payload(notarity_payload)
        notarity_payload["confirmedPrice"] = confirmed_price

        payload["notarityAppointmentRequestPayload"] = notarity_payload
        payload["notarityPriceLineItems"] = line_items or []
        payload["notarityPricingWarning"] = pricing_warning
    except Exception as exc:
        payload["notarityAppointmentRequestPayload"] = None
        payload["notarityPriceLineItems"] = []
        payload["notarityPricingWarning"] = str(exc)

    try:
        (DATA_DIR / ("%s_booking_payload.json" % booking_id)).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except Exception:
        pass

    return {
        "booking_id": booking_id,
        "status": "ready_to_book",
        "missing_fields": [],
        "booking_payload": payload,
    }


@app.get("/download-booking/{booking_id}")
def download_booking(booking_id: str):
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", booking_id)
    file_path = DATA_DIR / ("%s_booking_payload.json" % safe_id)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Booking not finalized yet or not found.")
    return FileResponse(
        path=str(file_path),
        media_type="application/json",
        filename="notarity_booking_%s.json" % safe_id,
    )
# --------------------------- Official notarity staging endpoints ---------------------------
# These endpoints mirror the sample-code flow:
# 1) read booking form, 2) resolve products by tag, 3) fetch timeslots,
# 4) price the payload, 5) optionally submit multipart appointment request.
# They are additive only: the existing MVP endpoints above are unchanged.

from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

try:
    import requests
except Exception:  # pragma: no cover
    requests = None  # type: ignore

NOTARITY_BASE_URL = "https://staging-api.notarity.com"
BOOKING_FORM_SLUG = "start-vienna-hackathon"
DEFAULT_BOOKING_FORM_ID = "kmVXjYM937qB8JTYG2yH"
DEFAULT_ORIGIN = "https://staging.notarity.com/#/my-companies/HpKfHmbViXxFEMzjtxln/appointment-requests"
DEFAULT_APPOINTMENT_DRAFT_ID = "vfniS9nfoq8nMpRqQj7Z"

AUSTRIA_PRODUCT_TAG = "5DVjVha92EJnyyO6138f"
SPAIN_NIE_TAG = "HdippWIH77AdMywneldY"
GENERAL_PRODUCT_TAG = "t7t78Pbrs5nEyHTqDuQv"
AT_TIMESLOT_LABEL = "yYD129MD1NizqtQKkLqN"
NON_AT_TIMESLOT_LABEL = "29sfIoZ9WgFQl8XjbKPu"
SPAIN_NIE_PRODUCT_ID = "UpEJ7raQEKQKFhWn12r2"
SPAIN_NIE_PERSONAL_DATA_ID = "xK5IkgPX1LTYdWLFzW8X"
SAMPLE_TIMESLOT_ID = "xitTkTMC18R0ZfCNtqyW"

COUNTRY_CODES = {
    "austria": "AT",
    "germany": "DE",
    "india": "IN",
    "spain": "ES",
    "sweden": "SE",
    "pakistan": "PK",
    "united arab emirates": "AE",
    "uae": "AE",
    "united states of america": "US",
    "united states": "US",
    "usa": "US",
    "united kingdom": "GB",
    "uk": "GB",
}

MONTHS_FOR_NOTARITY = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def _notarity_get(path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    if requests is None:
        raise RuntimeError("requests is not installed. Run: pip install requests")
    response = requests.get(
        f"{NOTARITY_BASE_URL}{path}",
        params=params,
        headers={"accept": "application/json, text/plain, */*"},
        timeout=8,
    )
    response.raise_for_status()
    return response.json()


def _notarity_post_json(path: str, payload: Dict[str, Any]) -> Any:
    if requests is None:
        raise RuntimeError("requests is not installed. Run: pip install requests")
    response = requests.post(
        f"{NOTARITY_BASE_URL}{path}",
        headers={
            "accept": "application/json, text/plain, */*",
            "cache-control": "no-cache",
            "content-type": "application/json",
            "origin": "https://staging.notarity.com",
            "referer": "https://staging.notarity.com/",
        },
        data=json.dumps(payload),
        timeout=12,
    )
    response.raise_for_status()
    return response.json()


def notarity_country_code(country: str) -> str:
    key = (country or "").strip().lower()
    if not key:
        return "AT"
    return COUNTRY_CODES.get(key, key[:2].upper())


def _notarity_fallback_product_tags(destination_country: str) -> List[str]:
    # Known-good staging tag ids, used only when the live form declares none.
    if destination_country == "AT":
        return [AUSTRIA_PRODUCT_TAG]
    if destination_country == "ES":
        return [SPAIN_NIE_TAG, GENERAL_PRODUCT_TAG]
    return [GENERAL_PRODUCT_TAG]


def notarity_product_tags_for_country(destination_country: str) -> List[str]:
    """Product-picker tags come from the live booking-form schema, not hardcoded.

    We evaluate the form's condition tree for this destination country and read
    the tag ids off the productPicker components that are actually visible. The
    constants remain only as a safety net for when the form cannot be fetched or
    yields nothing -- the same philosophy as confirmedPrice: trust the server
    value, fall back gracefully."""
    form = _notarity_cached_form()
    if form is not None:
        tags = _notarity_product_picker_tags_from_form(
            form, _notarity_form_context(destination_country))
        if tags:
            return tags
    return _notarity_fallback_product_tags(destination_country)


def notarity_timeslot_label_for_country(destination_country: str) -> str:
    """Timeslot label is read from the visible timeSlots component's
    props.timeslotLabel (the form gates AT vs. non-AT with an EQUAL condition),
    rather than hardcoded. Falls back to the known label only if the form is
    unavailable or yields none."""
    form = _notarity_cached_form()
    if form is not None:
        labels = _notarity_timeslot_labels_from_form(
            form, _notarity_form_context(destination_country))
        if labels:
            return labels[0]
    return AT_TIMESLOT_LABEL if destination_country == "AT" else NON_AT_TIMESLOT_LABEL


def _notarity_safe_timezone(name: str):
    """Return an IANA timezone without crashing on Windows machines without tzdata."""
    if ZoneInfo is not None:
        try:
            return ZoneInfo(name)
        except Exception:
            # Windows Python often needs the separate tzdata package. If it is not
            # installed yet, keep the local demo running with a safe UTC fallback
            # instead of crashing the pricing endpoint.
            pass
    return timezone.utc


def notarity_fetch_booking_form() -> Dict[str, Any]:
    return _notarity_get("/booking-form/slug", {"slug": BOOKING_FORM_SLUG})


# The booking-form schema is static for a given slug, so fetch it once per process
# and reuse it. This keeps the schema-driven tag/label lookups below cheap even
# though they may be called several times while a single payload is assembled.
_NOTARITY_FORM_CACHE: Dict[str, Any] = {}


def _notarity_cached_form() -> Optional[Dict[str, Any]]:
    """Return the live booking-form schema, cached after the first success.

    Only successful fetches are cached; a failure returns None and is retried on
    the next call, so a server that started before staging was reachable still
    recovers."""
    form = _NOTARITY_FORM_CACHE.get("form")
    if isinstance(form, dict):
        return form
    try:
        fetched = notarity_fetch_booking_form()
        if isinstance(fetched, dict):
            _NOTARITY_FORM_CACHE["form"] = fetched
            return fetched
    except Exception:
        return None
    return None


def notarity_booking_form_id() -> str:
    form = _notarity_cached_form()
    if isinstance(form, dict) and form.get("id"):
        return str(form["id"])
    return DEFAULT_BOOKING_FORM_ID


# --- Walk the booking-form schema (the source of truth for tags + timeslot label) ---
# Instead of hardcoding staging tag ids and timeslot labels, we read them from the
# productPicker and timeSlots components in the form returned by /booking-form/slug.
# The walkers are tolerant of how the form builder nests/labels things, and the
# callers fall back to the previous constants only when the form yields nothing.

def _notarity_looks_like_opaque_id(value: str) -> bool:
    # Staging tag ids / timeslot labels are opaque alphanumeric tokens with no
    # spaces (e.g. "yYD129MD1NizqtQKkLqN"). This guards against accidentally
    # picking up a human-readable display string.
    return bool(re.fullmatch(r"[A-Za-z0-9_-]{10,40}", value or ""))


def _notarity_collect_tag_ids(value: Any) -> List[str]:
    """Tag entries may be plain strings or objects like {id|value|tag|_id}."""
    out: List[str] = []
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, dict):
        for k in ("id", "value", "tag", "_id", "_tag"):
            if isinstance(value.get(k), str) and value[k]:
                out.append(value[k])
                break
    elif isinstance(value, list):
        for item in value:
            out.extend(_notarity_collect_tag_ids(item))
    return [t for t in out if t]


def _notarity_resolve_compare(context: Dict[str, Any], path: Optional[str]) -> Any:
    """Resolve a condition's `compare` path (e.g. "destinationCountry",
    "products.id", "hardCopy.hardCopy") against the evaluation context."""
    if not path:
        return None
    current: Any = context
    for part in str(path).split("."):
        if isinstance(current, list):
            collected = []
            for item in current:
                if isinstance(item, dict) and item.get(part) is not None:
                    collected.append(item.get(part))
            current = collected
        elif isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _notarity_parse_condition_value(raw: Any) -> Any:
    """Condition values arrive as plain strings ("AT") or JSON-encoded arrays
    ('["AT"]'). Decode the JSON ones; leave plain strings as-is."""
    if isinstance(raw, str):
        stripped = raw.strip()
        if stripped[:1] in "[{":
            try:
                return json.loads(stripped)
            except Exception:
                return raw
    return raw


def _notarity_condition_passes(props: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate one condition component against the context. Mirrors the staging
    form-builder operators: ISDEFINED, ISTRUE, EQUAL, INCLUDES, INTERSECTS."""
    operator = str(props.get("condition") or "").upper()
    actual = _notarity_resolve_compare(context, props.get("compare"))
    expected = _notarity_parse_condition_value(props.get("value"))

    if operator == "ISDEFINED":
        return actual not in (None, "", [], {})
    if operator == "ISTRUE":
        return bool(actual)
    if operator == "EQUAL":
        return actual == expected
    if operator == "INCLUDES":
        choices = expected if isinstance(expected, list) else [expected]
        if isinstance(actual, list):
            return any(a in choices for a in actual)
        return actual in choices
    if operator == "INTERSECTS":
        choices = expected if isinstance(expected, list) else [expected]
        actuals = actual if isinstance(actual, list) else ([] if actual is None else [actual])
        return any(a in choices for a in actuals)
    # Unknown operator: don't hide content -- treat as visible.
    return True


def _notarity_visible_components(node: Any, context: Dict[str, Any]):
    """Yield the components visible for `context`, walking pages -> components
    and following each condition's components/elseComponents branch."""
    if isinstance(node, list):
        for item in node:
            yield from _notarity_visible_components(item, context)
        return
    if not isinstance(node, dict):
        return
    if node.get("type") == "condition":
        props = node.get("props") if isinstance(node.get("props"), dict) else {}
        branch = "components" if _notarity_condition_passes(props, context) else "elseComponents"
        yield from _notarity_visible_components(props.get(branch) or [], context)
        return
    yield node
    for key in ("pages", "components", "children"):
        child = node.get(key)
        if isinstance(child, (list, dict)):
            yield from _notarity_visible_components(child, context)


def _notarity_form_context(destination_country: str,
                           product_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "destinationCountry": destination_country,
        "products": [{"id": pid} for pid in (product_ids or [])],
    }


def _notarity_product_picker_tags_from_form(form: Dict[str, Any],
                                            context: Dict[str, Any]) -> List[str]:
    """Tag ids from the productPicker components visible for this context."""
    tags: List[str] = []
    for comp in _notarity_visible_components(form, context):
        if comp.get("type") != "productPicker":
            continue
        props = comp.get("props") if isinstance(comp.get("props"), dict) else {}
        tags.extend(_notarity_collect_tag_ids(props.get("tags")))
    seen, unique = set(), []
    for t in tags:
        if t and t not in seen:
            seen.add(t)
            unique.append(t)
    return unique


def _notarity_timeslot_labels_from_form(form: Dict[str, Any],
                                        context: Dict[str, Any]) -> List[str]:
    """props.timeslotLabel from the timeSlots components visible for this context."""
    labels: List[str] = []
    for comp in _notarity_visible_components(form, context):
        if comp.get("type") != "timeSlots":
            continue
        props = comp.get("props") if isinstance(comp.get("props"), dict) else {}
        label = props.get("timeslotLabel")
        if isinstance(label, str) and _notarity_looks_like_opaque_id(label):
            labels.append(label)
    seen, unique = set(), []
    for lbl in labels:
        if lbl not in seen:
            seen.add(lbl)
            unique.append(lbl)
    return unique


def notarity_fetch_products_by_tags(tags: List[str]) -> List[Dict[str, Any]]:
    products: List[Dict[str, Any]] = []
    for tag in tags:
        try:
            result = _notarity_get("/products/tags", {"_tags": tag})
            if isinstance(result, list):
                products.extend([p for p in result if isinstance(p, dict)])
        except Exception:
            continue

    seen = set()
    unique: List[Dict[str, Any]] = []
    for product in products:
        pid = product.get("id")
        if pid and pid not in seen:
            seen.add(pid)
            unique.append(product)
    return unique


def notarity_parse_appointment_datetime(slot_date: str, slot_time: str) -> datetime:
    date_value = (slot_date or "").strip().replace(",", "")
    time_value = (slot_time or "").strip()
    local_tz = _notarity_safe_timezone("Europe/Vienna")
    now = datetime.now(local_tz)

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_value):
        base = datetime.fromisoformat(date_value).replace(tzinfo=local_tz)
    else:
        parts = [p for p in date_value.split() if p]
        day = next((int(p) for p in parts if re.fullmatch(r"\d{1,2}", p)), now.day)
        month_token = next((p.lower() for p in parts if p.lower() in MONTHS_FOR_NOTARITY), None)
        month = MONTHS_FOR_NOTARITY.get(month_token or "", now.month)
        year = now.year
        base = datetime(year, month, day, tzinfo=local_tz)
        if base.date() < now.date():
            base = datetime(year + 1, month, day, tzinfo=local_tz)

    match = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$", time_value, re.I)
    hour = 9
    minute = 0
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2) or "0")
        suffix = (match.group(3) or "").upper()
        if suffix == "PM" and hour < 12:
            hour += 12
        if suffix == "AM" and hour == 12:
            hour = 0

    # The frontend shows Vienna times by default; send the corresponding UTC time to Notarity.
    return base.replace(hour=hour, minute=minute, second=0, microsecond=0).astimezone(timezone.utc)


def notarity_fetch_timeslots(destination_country: str, start: datetime, days: int = 7) -> List[Dict[str, Any]]:
    label = notarity_timeslot_label_for_country(destination_country)
    start_utc = start.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    end_utc = start_utc + timedelta(days=days)
    try:
        result = _notarity_get(
            "/appointment-requests/timeslots",
            {
                "_timeslotLabel": label,
                "startDate": start_utc.isoformat().replace("+00:00", "Z"),
                "endDate": end_utc.isoformat().replace("+00:00", "Z"),
            },
        )
        return result if isinstance(result, list) else []
    except Exception:
        return []


def _notarity_title(product: Dict[str, Any]) -> str:
    title = product.get("title") or ""
    if isinstance(title, dict):
        return title.get("en") or title.get("de") or title.get("es") or next(iter(title.values()), "")
    return str(title)


def _notarity_norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _notarity_token_score(a: str, b: str) -> int:
    return len(set(_notarity_norm(a).split()) & set(_notarity_norm(b).split()))


def _notarity_find_best_product(local_id: str, local_title: str, products: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not products:
        return None
    for product in products:
        if product.get("id") == local_id:
            return product
    local_text = f"{local_id} {local_title}"
    scored = sorted(
        products,
        key=lambda p: _notarity_token_score(local_text, f"{p.get('id', '')} {_notarity_title(p)} {p.get('description', '')}"),
        reverse=True,
    )
    if scored and _notarity_token_score(local_text, _notarity_title(scored[0])) > 0:
        return scored[0]
    return products[0]


def _notarity_apostille_value(draft: Dict[str, Any], product: Optional[Dict[str, Any]] = None) -> Optional[bool]:
    if product and product.get("apostilleRequired") is True:
        return True
    value = str(draft.get("apostille", "")).strip().lower()
    if value in {"yes", "true", "add", "yes, add apostille"}:
        return True
    if value in {"no", "false", "none", "no apostille needed"}:
        return False
    return None


def _notarity_hard_copy(draft: Dict[str, Any]) -> Dict[str, bool]:
    value = str(draft.get("deliveryMethod", "")).lower()
    hard_copy = any(token in value for token in ["physical", "post", "hard", "both"])
    express = "express" in value
    return {"expressShipping": express, "hardCopy": hard_copy}


def _notarity_phone(details: Dict[str, Any]) -> str:
    return f"{details.get('phoneCountryCode', '')}{details.get('phoneNumber', '')}".strip() or details.get("phone", "")


def _notarity_details(details: Dict[str, Any], fallback_country: str) -> Dict[str, Any]:
    # Only the fields staging's strict DTO whitelists. Do NOT add companyName or
    # any *SameAsBillingDetails flag here: the submit endpoint
    # (/appointment-requests) rejects unknown properties with HTTP 400
    # "property <x> should not exist". The same-as-billing flag is attached by the
    # caller, and only on the object that actually allows it (contactDetails /
    # shippingDetails).
    return {
        "firstName": details.get("firstName", ""),
        "lastName": details.get("lastName", ""),
        "business": bool(details.get("isCompany", False)),
        "email": details.get("email", ""),
        "phoneNumber": _notarity_phone(details),
        "address": " ".join([str(details.get("street", "")).strip(), str(details.get("apartment", "")).strip()]).strip(),
        "zipCode": details.get("zipCode", ""),
        "city": details.get("city", ""),
        "stateProvince": details.get("stateRegion", ""),
        "countryCode": notarity_country_code(details.get("country", "")) if details.get("country") else fallback_country,
    }


def _notarity_select_timeslot_id(draft: Dict[str, Any], destination_country: str) -> str:
    start = notarity_parse_appointment_datetime(draft.get("slotDate", ""), draft.get("slotTime", ""))
    slots = notarity_fetch_timeslots(destination_country, start)
    if not slots:
        return SAMPLE_TIMESLOT_ID

    chosen_day = start.date()
    for slot in slots:
        if not slot.get("available", 0):
            continue
        try:
            slot_start = datetime.fromisoformat(slot["startTime"].replace("Z", "+00:00"))
            if slot_start.date() == chosen_day:
                return slot.get("id") or SAMPLE_TIMESLOT_ID
        except Exception:
            continue
    first = next((slot for slot in slots if slot.get("available", 0)), slots[0])
    return first.get("id") or SAMPLE_TIMESLOT_ID


def build_notarity_appointment_request_payload(booking_id: str, draft: Dict[str, Any]) -> Dict[str, Any]:
    destination_country = notarity_country_code(draft.get("countryOfUse", "Austria"))
    selected_docs = draft.get("selectedDocuments") or []
    products_from_api = notarity_fetch_products_by_tags(notarity_product_tags_for_country(destination_country))

    if not selected_docs:
        selected_docs = [{
            "productId": draft.get("recommendedProductId") or draft.get("product") or "signature_notarisation",
            "productTitle": draft.get("product") or "Signature notarisation",
            "fileName": "",
        }]

    products_payload: List[Dict[str, Any]] = []
    instant_supported = False

    for doc in selected_docs:
        local_id = str(doc.get("productId", ""))
        local_title = str(doc.get("productTitle", ""))
        file_name = str(doc.get("fileName", "")).strip()

        if destination_country == "ES" and "nie" in _notarity_norm(f"{local_id} {local_title}"):
            products_payload.append({
                "id": SPAIN_NIE_PRODUCT_ID,
                "apostille": True,
                "userInput": "",
                "documentsNotReadyYet": not bool(file_name),
                "needHelpDrafting": False,
                "proofOfRepresentation": None,
                "files": [file_name] if file_name else [],
            })
            products_payload.append({
                "id": SPAIN_NIE_PERSONAL_DATA_ID,
                "apostille": None,
                "userInput": "",
                "documentsNotReadyYet": False,
                "needHelpDrafting": False,
                "proofOfRepresentation": None,
                "files": [],
            })
            continue

        product = _notarity_find_best_product(local_id, local_title, products_from_api)
        if product is None:
            product = {
                "id": local_id or "signature_notarisation",
                "title": {"en": local_title or "Signature notarisation"},
                "apostilleRequired": False,
                "instantNotarisationSupported": False,
            }

        instant_supported = instant_supported or bool(product.get("instantNotarisationSupported"))
        products_payload.append({
            "id": product.get("id"),
            "apostille": _notarity_apostille_value(draft, product),
            "userInput": "",
            "documentsNotReadyYet": not bool(file_name),
            "needHelpDrafting": False,
            "proofOfRepresentation": None,
            "files": [file_name] if file_name else [],
        })

    participants = draft.get("participantsList") or []
    participants_payload = [
        {"email": p.get("email", ""), "client": i == 0, "supervisor": False}
        for i, p in enumerate(participants)
        if p.get("email")
    ]

    billing = draft.get("billingDetails") or {}
    contact = billing if draft.get("sameContactAsBilling", True) else (draft.get("contactDetails") or {})
    hard_copy = _notarity_hard_copy(draft)

    return {
        "_bookingForm": notarity_booking_form_id(),
        "language": "en",
        "origin": DEFAULT_ORIGIN,
        "confirmedPrice": 0,
        "hardCopy": hard_copy,
        "newsletter": False,
        "mode": "debug",
        # _appointmentRequestDraft must be a REAL Notarity staging draft id, not our
        # internal booking_id (a local uuid4 hex). Sending the local id makes
        # /appointment-requests/price and /appointment-requests return HTTP 404
        # "appointmentRequestDraft with ID ... not found". Use a valid staging draft
        # id; allow an explicit override only if the draft carries a real one.
        "_appointmentRequestDraft": draft.get("notarityDraftId") or DEFAULT_APPOINTMENT_DRAFT_ID,
        "destinationCountry": destination_country,
        "products": products_payload,
        "participants": participants_payload,
        "timeslots": [_notarity_select_timeslot_id(draft, destination_country)],
        "instantNotarisationSupported": instant_supported,
        "instant": False,
        "timezone": draft.get("timezone") or "Europe/Vienna",
        "billingDetails": _notarity_details(billing, destination_country),
        "contactDetails": {
            **_notarity_details(contact, destination_country),
            # contactDetails is the only object that may carry this flag.
            "contactDetailsSameAsBillingDetails": bool(draft.get("sameContactAsBilling", True)),
        },
        # Current UI has no separate shipping form, so mirror billing for hard-copy shipments.
        "shippingDetails": {**_notarity_details(billing, destination_country), "shippingDetailsSameAsBillingDetails": True},
        "preferredNotary": draft.get("notary", "") or "",
    }


def price_notarity_appointment_payload(payload: Dict[str, Any]) -> Tuple[Optional[List[Dict[str, Any]]], Optional[float], Optional[str]]:
    try:
        line_items = _notarity_post_json("/appointment-requests/price", payload)
        if not isinstance(line_items, list):
            return None, None, "Unexpected price response"
        cents = sum(int(item.get("net", 0) or 0) for item in line_items if isinstance(item, dict))
        return line_items, cents / 100, None
    except Exception as exc:
        # confirmedPrice must come from the official /appointment-requests/price endpoint.
        # If staging cannot price it, return null instead of inventing a client-side price.
        return None, None, str(exc)


@app.get("/notarity/booking-form")
def notarity_booking_form_endpoint():
    """Fetch the official hackathon booking-form schema from notarity staging."""
    try:
        return notarity_fetch_booking_form()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch booking form: {exc}")


@app.get("/notarity/products")
def notarity_products_endpoint(country: str = "Austria"):
    """Resolve productPicker tags into product definitions for a selected country."""
    destination_country = notarity_country_code(country)
    tags = notarity_product_tags_for_country(destination_country)
    products = notarity_fetch_products_by_tags(tags)
    return {"destinationCountry": destination_country, "tags": tags, "products": products}


@app.get("/notarity/timeslots")
def notarity_timeslots_endpoint(country: str = "Austria", slotDate: str = "", slotTime: str = "09:00"):
    """Fetch available staging timeslots using the correct opaque timeslot label."""
    destination_country = notarity_country_code(country)
    start = notarity_parse_appointment_datetime(slotDate, slotTime)
    return {
        "destinationCountry": destination_country,
        "timeslotLabel": notarity_timeslot_label_for_country(destination_country),
        "timeslots": notarity_fetch_timeslots(destination_country, start),
    }


@app.post("/notarity/price")
def notarity_price_endpoint(req: FinalizeRequest):
    """Build official appointment payload and price it via /appointment-requests/price."""
    draft = req.draft or {}
    missing = validate_draft(draft)
    if missing:
        return {
            "status": "missing_fields",
            "missing_fields": missing,
            "line_items": [],
            "confirmedPrice": None,
            "payload": None,
        }

    booking_id = req.booking_id or draft.get("bookingId") or uuid.uuid4().hex

    try:
        payload = build_notarity_appointment_request_payload(booking_id, draft)
    except Exception as exc:
        # Do not let a staging/network/timezone issue turn into a browser CORS
        # failure. The frontend can show the real warning and keep the demo flow.
        return {
            "status": "priced",
            "missing_fields": [],
            "confirmedPrice": None,
            "line_items": [],
            "pricing_warning": f"Could not build Notarity staging payload: {exc}",
            "payload": None,
        }

    line_items, confirmed_price, warning = price_notarity_appointment_payload(payload)
    payload["confirmedPrice"] = confirmed_price

    try:
        (DATA_DIR / ("%s_notarity_payload.json" % booking_id)).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except Exception:
        pass

    return {
        "status": "priced",
        "missing_fields": [],
        "confirmedPrice": confirmed_price,
        "line_items": line_items or [],
        "pricing_warning": warning,
        "payload": payload,
    }


@app.post("/notarity/submit-appointment-request")
def notarity_submit_appointment_request_endpoint(req: FinalizeRequest):
    """Optional real staging submit using multipart/form-data: files + payload JSON."""
    if requests is None:
        raise HTTPException(status_code=500, detail="requests is not installed. Run: pip install requests")

    draft = req.draft or {}
    missing = validate_draft(draft)
    if missing:
        return {"status": "missing_fields", "missing_fields": missing, "submission": None}

    booking_id = req.booking_id or draft.get("bookingId") or uuid.uuid4().hex
    try:
        payload = build_notarity_appointment_request_payload(booking_id, draft)
    except Exception as exc:
        return {
            "status": "submission_failed",
            "missing_fields": [],
            "pricing_warning": f"Could not build Notarity staging payload: {exc}",
            "line_items": [],
            "confirmedPrice": None,
            "payload": None,
            "submission": {"status_code": 0, "ok": False, "response": str(exc)},
        }

    line_items, confirmed_price, warning = price_notarity_appointment_payload(payload)
    payload["confirmedPrice"] = confirmed_price

    form_files = []
    opened_files = []
    try:
        for doc in draft.get("selectedDocuments") or []:
            filename = str(doc.get("fileName", "")).strip()
            if not filename:
                continue
            safe_name = Path(filename).name
            stored = UPLOAD_DIR / ("%s_%s" % (booking_id, safe_name))
            if not stored.exists():
                continue
            fh = stored.open("rb")
            opened_files.append(fh)
            form_files.append(("files", (safe_name, fh, "application/pdf")))

        # Send the JSON payload as a multipart field (filename=None -> plain form
        # field), exactly like the browser's FormData.append("payload", json).
        # This MUST go through files= rather than data=: when form_files has no
        # uploaded PDFs, requests with data={...} falls back to
        # application/x-www-form-urlencoded, which staging rejects with HTTP 400
        # "Supported content-type: multipart/form-data". Putting the payload in
        # files= guarantees multipart/form-data even with zero attachments.
        form_files.append(("payload", (None, json.dumps(payload))))

        response = requests.post(
            f"{NOTARITY_BASE_URL}/appointment-requests",
            headers={
                "accept": "application/json, text/plain, */*",
                "accept-language": "en-AT,en;q=0.9",
                "cache-control": "no-cache",
                "referer": "https://staging.notarity.com/",
            },
            files=form_files,
            timeout=30,
        )

        try:
            response_body = response.json()
        except Exception:
            response_body = response.text

        submission = {
            "status_code": response.status_code,
            "ok": response.ok,
            "response": response_body,
        }
    finally:
        for fh in opened_files:
            try:
                fh.close()
            except Exception:
                pass

    return {
        "status": "submitted" if submission.get("ok") else "submission_failed",
        "pricing_warning": warning,
        "line_items": line_items or [],
        "confirmedPrice": confirmed_price,
        "payload": payload,
        "submission": submission,
    }


# --------------------------- Address autocomplete (EGON) ---------------------------
# This keeps the existing backend intact and only adds the address dropdown proxy.
# Frontend calls: GET /autocomplete-address?q=<typed text>&country=<selected country>
# Backend calls EGON so the token stays in backend/.env.

try:
    import pycountry  # type: ignore
except Exception:  # pragma: no cover
    pycountry = None  # type: ignore

DEFAULT_EGON_AUTOCOMPLETE_URL = "https://api.egon.com/v4/suggest/address"

_ISO3_ALIASES = {
    "austria": "AUT", "österreich": "AUT", "osterreich": "AUT",
    "germany": "DEU", "deutschland": "DEU",
    "spain": "ESP", "españa": "ESP", "espana": "ESP",
    "india": "IND",
    "united states": "USA", "united states of america": "USA", "usa": "USA", "us": "USA",
    "united kingdom": "GBR", "uk": "GBR", "great britain": "GBR",
    "uae": "ARE", "united arab emirates": "ARE",
    "sweden": "SWE", "pakistan": "PAK", "andorra": "AND",
    "switzerland": "CHE", "france": "FRA", "italy": "ITA",
    "netherlands": "NLD", "portugal": "PRT", "ireland": "IRL",
}


def normalize_country_to_iso3(country: str = "", iso3: str = "") -> str:
    if iso3 and len(iso3.strip()) == 3:
        return iso3.strip().upper()

    country_clean = (country or "").strip()
    alias = _ISO3_ALIASES.get(country_clean.lower())
    if alias:
        return alias

    if pycountry is not None:
        try:
            return pycountry.countries.lookup(country_clean).alpha_3
        except Exception:
            pass

    return "AUT"


def _pick_address_value(sources: List[Dict[str, Any]], keys: List[str]) -> str:
    for source in sources:
        for key in keys:
            value = source.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()
    return ""


def _normalise_egon_suggestion(item: Any, index: int, fallback_country: str) -> Dict[str, str]:
    if not isinstance(item, dict):
        value = str(item).strip()
        return {
            "id": f"address-{index}",
            "street": value,
            "city": "",
            "zipcode": "",
            "state": "",
            "province": "",
            "country": fallback_country,
            "label": value,
        }

    nested_candidates: List[Dict[str, Any]] = [item]
    for nested_key in ("data", "address", "properties", "result", "candidate"):
        nested = item.get(nested_key)
        if isinstance(nested, dict):
            nested_candidates.append(nested)
            nested_address = nested.get("address")
            if isinstance(nested_address, dict):
                nested_candidates.append(nested_address)

    street = _pick_address_value(
        nested_candidates,
        [
            "street",
            "streetName",
            "street_name",
            "thoroughfare",
            "route",
            "addressLine1",
            "line1",
            "address",
        ],
    )
    house_number = _pick_address_value(
        nested_candidates,
        ["houseNumber", "housenumber", "house_number", "streetNumber", "street_number", "number"],
    )

    if street and house_number and house_number not in street:
        street = f"{street} {house_number}"

    city = _pick_address_value(
        nested_candidates,
        ["city", "locality", "town", "municipality", "place", "postalTown"],
    )
    zipcode = _pick_address_value(
        nested_candidates,
        ["zipcode", "zipCode", "postalCode", "postcode", "zip", "postal_code"],
    )
    state = _pick_address_value(
        nested_candidates,
        ["state", "province", "region", "stateProvince", "county", "administrativeArea"],
    )
    country = _pick_address_value(
        nested_candidates,
        ["country", "countryName", "country_name"],
    ) or fallback_country

    label = _pick_address_value(
        nested_candidates,
        ["label", "formatted", "formattedAddress", "fullAddress", "displayName", "text", "description"],
    )

    if not label:
        label = ", ".join(part for part in [street, f"{zipcode} {city}".strip(), country] if part)

    if not street:
        street = label

    return {
        "id": str(item.get("id") or item.get("_id") or item.get("uid") or f"address-{index}"),
        "street": street,
        "city": city,
        "zipcode": zipcode,
        "state": state,
        "province": state,
        "country": country,
        "label": label,
    }


def _extract_egon_suggestions(raw: Any, fallback_country: str) -> List[Dict[str, str]]:
    items: Any = []

    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, dict):
        possible_paths = [
            ("data", "results"),
            ("data", "suggestions"),
            ("data", "candidates"),
            ("data", "items"),
            ("data", "addresses"),
            ("results",),
            ("suggestions",),
            ("candidates",),
            ("items",),
            ("addresses",),
        ]

        for path in possible_paths:
            node: Any = raw
            for key in path:
                node = node.get(key) if isinstance(node, dict) else None
            if isinstance(node, list):
                items = node
                break

    if not isinstance(items, list):
        items = []

    return [_normalise_egon_suggestion(item, index, fallback_country) for index, item in enumerate(items)]


@app.get("/autocomplete-address")
def autocomplete_address(
    q: str = Query(..., min_length=2, description="Street/city name to search"),
    country: str = Query("", description="Country name, e.g. Austria, Spain, Germany"),
    iso3: str = Query("", description="Optional ISO3 country code, e.g. AUT, ESP, DEU"),
):
    if requests is None:
        raise HTTPException(status_code=500, detail="requests is not installed. Run: pip install requests")

    egon_token = os.getenv("EGON_API_TOKEN")
    egon_url = os.getenv("EGON_AUTOCOMPLETE_URL", DEFAULT_EGON_AUTOCOMPLETE_URL)

    if not egon_token:
        raise HTTPException(status_code=500, detail="EGON_API_TOKEN missing in backend .env")

    if not egon_url:
        raise HTTPException(status_code=500, detail="EGON_AUTOCOMPLETE_URL missing in backend .env")

    selected_country = (country or "Austria").strip() or "Austria"
    final_iso3 = normalize_country_to_iso3(country=selected_country, iso3=iso3)

    headers = {
        "Authorization": f"Bearer {egon_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "data": {"query": q},
        "par": {
            "iso3": final_iso3,
            "max_candidates": 8,
        },
    }

    try:
        response = requests.post(egon_url, json=payload, headers=headers, timeout=10)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Autocomplete request failed: {type(exc).__name__}: {exc}",
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"EGON returned {response.status_code}: {response.text}",
        )

    try:
        raw = response.json()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"EGON returned non-JSON response: {type(exc).__name__}: {exc}",
        )

    # Keep the same shape your teammate's billing.tsx expects:
    # const data = await response.json(); data.data?.results
    return {
        "data": {
            "results": _extract_egon_suggestions(raw, selected_country),
        }
    }
