"""Helpers for the official notarity staging appointment request flow.

These functions mirror the hackathon sample code without changing the frontend
flow. The backend builds a staging-compatible payload from our BookingDraft,
then can price it and optionally submit it as multipart/form-data.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore
from typing import Any, Dict, Iterable, List, Optional, Tuple
import json
import re

try:
    import requests
except Exception:  # pragma: no cover
    requests = None  # type: ignore

NOTARITY_BASE_URL = "https://staging-api.notarity.com"
BOOKING_FORM_SLUG = "start-vienna-hackathon"
DEFAULT_BOOKING_FORM_ID = "kmVXjYM937qB8JTYG2yH"
DEFAULT_ORIGIN = "https://staging.notarity.com/#/my-companies/HpKfHmbViXxFEMzjtxln/appointment-requests"
DEFAULT_APPOINTMENT_DRAFT_ID = "vfniS9nfoq8nMpRqQj7Z"

# IDs from the sample documentation. We still fetch the form/products at runtime
# when possible, but these fallbacks keep the demo payload stable offline.
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

MONTHS = {
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


def _http_get(path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    if requests is None:
        raise RuntimeError("requests is not installed")
    response = requests.get(
        f"{NOTARITY_BASE_URL}{path}",
        params=params,
        headers={"accept": "application/json, text/plain, */*"},
        timeout=4,
    )
    response.raise_for_status()
    return response.json()


def _http_post_json(path: str, payload: Dict[str, Any]) -> Any:
    if requests is None:
        raise RuntimeError("requests is not installed")
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
        timeout=6,
    )
    response.raise_for_status()
    return response.json()


def country_code(country: str) -> str:
    key = (country or "").strip().lower()
    return COUNTRY_CODES.get(key, key[:2].upper() if key else "AT")


def timeslot_label_for_country(destination_country: str) -> str:
    return AT_TIMESLOT_LABEL if destination_country == "AT" else NON_AT_TIMESLOT_LABEL


def product_tags_for_country(destination_country: str) -> List[str]:
    if destination_country == "AT":
        return [AUSTRIA_PRODUCT_TAG]
    if destination_country == "ES":
        return [SPAIN_NIE_TAG, GENERAL_PRODUCT_TAG]
    return [GENERAL_PRODUCT_TAG]


def _safe_timezone(name: str):
    """Return an IANA timezone without crashing on Windows machines without tzdata."""
    if ZoneInfo is not None:
        try:
            return ZoneInfo(name)
        except Exception:
            pass
    return timezone.utc


def fetch_booking_form() -> Dict[str, Any]:
    return _http_get("/booking-form/slug", {"slug": BOOKING_FORM_SLUG})


def booking_form_id() -> str:
    try:
        form = fetch_booking_form()
        if isinstance(form, dict) and form.get("id"):
            return str(form["id"])
    except Exception:
        pass
    return DEFAULT_BOOKING_FORM_ID


def fetch_products_by_tags(tags: Iterable[str]) -> List[Dict[str, Any]]:
    products: List[Dict[str, Any]] = []
    for tag in tags:
        try:
            result = _http_get("/products/tags", {"_tags": tag})
            if isinstance(result, list):
                products.extend([p for p in result if isinstance(p, dict)])
        except Exception:
            continue
    # Deduplicate by id while preserving order.
    seen = set()
    unique: List[Dict[str, Any]] = []
    for product in products:
        pid = product.get("id")
        if pid and pid not in seen:
            seen.add(pid)
            unique.append(product)
    return unique


def fetch_timeslots(destination_country: str, start: datetime, days: int = 7) -> List[Dict[str, Any]]:
    label = timeslot_label_for_country(destination_country)
    start_utc = start.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    end_utc = start_utc + timedelta(days=days)
    try:
        result = _http_get(
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


def parse_appointment_datetime(slot_date: str, slot_time: str) -> datetime:
    """Parse our frontend date/time strings into a timezone-aware UTC datetime."""
    date = (slot_date or "").strip().replace(",", "")
    time = (slot_time or "").strip()
    local_tz = _safe_timezone("Europe/Vienna")
    now = datetime.now(local_tz)

    # ISO date from the frontend: 2026-06-11
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        base = datetime.fromisoformat(date).replace(tzinfo=local_tz)
    else:
        parts = [p for p in date.split() if p]
        day = next((int(p) for p in parts if re.fullmatch(r"\d{1,2}", p)), now.day)
        month_token = next((p.lower() for p in parts if p.lower() in MONTHS), None)
        month = MONTHS.get(month_token or "", now.month)
        year = now.year
        base = datetime(year, month, day, tzinfo=local_tz)
        if base.date() < now.date():
            base = datetime(year + 1, month, day, tzinfo=local_tz)

    match = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$", time, re.I)
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

    # Treat chosen frontend time as Europe/Vienna local time and send UTC to Notarity.
    local = base.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return local.astimezone(timezone.utc)


def _localized_title(product: Dict[str, Any]) -> str:
    title = product.get("title") or ""
    if isinstance(title, dict):
        return title.get("en") or title.get("de") or title.get("es") or next(iter(title.values()), "")
    return str(title)


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _token_score(a: str, b: str) -> int:
    left = set(_norm(a).split())
    right = set(_norm(b).split())
    return len(left & right)


def _find_best_product(local_id: str, local_title: str, products: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not products:
        return None
    local_text = f"{local_id} {local_title}"
    for product in products:
        if product.get("id") == local_id:
            return product
    scored = sorted(
        products,
        key=lambda p: _token_score(local_text, f"{p.get('id', '')} {_localized_title(p)} {p.get('description', '')}"),
        reverse=True,
    )
    if scored and _token_score(local_text, _localized_title(scored[0])) > 0:
        return scored[0]
    return products[0]


def _apostille_value(draft: Dict[str, Any], product: Optional[Dict[str, Any]] = None) -> Optional[bool]:
    if product and product.get("apostilleRequired") is True:
        return True
    value = str(draft.get("apostille", "")).strip().lower()
    if value in {"yes", "true", "add", "yes, add apostille"}:
        return True
    if value in {"no", "false", "none", "no apostille needed"}:
        return False
    return None


def _hard_copy(draft: Dict[str, Any]) -> Dict[str, bool]:
    value = str(draft.get("deliveryMethod", "")).lower()
    hard_copy = any(token in value for token in ["physical", "post", "hard", "both"])
    express = "express" in value
    return {"expressShipping": express, "hardCopy": hard_copy}


def _phone(details: Dict[str, Any]) -> str:
    return f"{details.get('phoneCountryCode', '')}{details.get('phoneNumber', '')}".strip() or details.get("phone", "")


def _country_code_from_details(details: Dict[str, Any], fallback: str) -> str:
    return country_code(details.get("country", "")) if details.get("country") else fallback


def _details(details: Dict[str, Any], fallback_country: str) -> Dict[str, Any]:
    # Only staging-whitelisted fields. companyName and *SameAsBillingDetails are
    # rejected by the submit endpoint with HTTP 400 "property <x> should not
    # exist"; the same-as-billing flag is added by the caller where allowed.
    return {
        "firstName": details.get("firstName", ""),
        "lastName": details.get("lastName", ""),
        "business": bool(details.get("isCompany", False)),
        "email": details.get("email", ""),
        "phoneNumber": _phone(details),
        "address": " ".join([str(details.get("street", "")).strip(), str(details.get("apartment", "")).strip()]).strip(),
        "zipCode": details.get("zipCode", ""),
        "city": details.get("city", ""),
        "stateProvince": details.get("stateRegion", ""),
        "countryCode": _country_code_from_details(details, fallback_country),
    }


def _shipping_details(draft: Dict[str, Any], billing: Dict[str, Any], fallback_country: str) -> Dict[str, Any]:
    # The current UI does not have a separate shipping form, so mirror billing.
    return {
        **_details(billing, fallback_country),
        "shippingDetailsSameAsBillingDetails": True,
    }


def _select_timeslot_id(draft: Dict[str, Any], destination_country: str) -> str:
    start = parse_appointment_datetime(draft.get("slotDate", ""), draft.get("slotTime", ""))
    slots = fetch_timeslots(destination_country, start)
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


def _fallback_product(local_id: str, local_title: str) -> Dict[str, Any]:
    return {
        "id": local_id or "signature_notarisation",
        "title": {"en": local_title or "Signature notarisation"},
        "apostilleRequired": False,
        "instantNotarisationSupported": False,
    }


def build_notarity_appointment_payload(booking_id: str, draft: Dict[str, Any]) -> Dict[str, Any]:
    destination_country = country_code(draft.get("countryOfUse", "Austria"))
    selected_docs = draft.get("selectedDocuments") or []
    products_from_api = fetch_products_by_tags(product_tags_for_country(destination_country))

    products_payload: List[Dict[str, Any]] = []
    instant_supported = False

    # If no selected documents exist, keep at least one product row from the draft.
    if not selected_docs:
        selected_docs = [{
            "productId": draft.get("product", "signature_notarisation"),
            "productTitle": draft.get("product", "Signature notarisation"),
            "fileName": "",
        }]

    for doc in selected_docs:
        local_id = str(doc.get("productId", ""))
        local_title = str(doc.get("productTitle", ""))
        file_name = str(doc.get("fileName", "")).strip()

        # Special case from sample code: Spain NIE application auto-adds NIE Personal Data.
        if destination_country == "ES" and "nie" in _norm(f"{local_id} {local_title}"):
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

        product = _find_best_product(local_id, local_title, products_from_api) or _fallback_product(local_id, local_title)
        instant_supported = instant_supported or bool(product.get("instantNotarisationSupported"))
        products_payload.append({
            "id": product.get("id"),
            "apostille": _apostille_value(draft, product),
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

    payload = {
        "_bookingForm": booking_form_id(),
        "language": "en",
        "origin": DEFAULT_ORIGIN,
        "confirmedPrice": 0,
        "hardCopy": _hard_copy(draft),
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
        "timeslots": [_select_timeslot_id(draft, destination_country)],
        "instantNotarisationSupported": instant_supported,
        "instant": False,
        "timezone": draft.get("timezone") or "Europe/Vienna",
        "billingDetails": _details(billing, destination_country),
        "contactDetails": {
            **_details(contact, destination_country),
            "contactDetailsSameAsBillingDetails": bool(draft.get("sameContactAsBilling", True)),
        },
        "shippingDetails": _shipping_details(draft, billing, destination_country),
        "preferredNotary": draft.get("notary", "") or "",
    }
    return payload


def price_notarity_payload(payload: Dict[str, Any]) -> Tuple[Optional[List[Dict[str, Any]]], Optional[float], Optional[str]]:
    try:
        line_items = _http_post_json("/appointment-requests/price", payload)
        if not isinstance(line_items, list):
            return None, None, "Unexpected price response"
        cents = sum(int(item.get("net", 0) or 0) for item in line_items if isinstance(item, dict))
        return line_items, cents / 100, None
    except Exception as exc:
        # confirmedPrice must come from /appointment-requests/price, not a local estimate.
        return None, None, str(exc)


def submit_notarity_payload(payload: Dict[str, Any], files: List[Tuple[str, Path]]) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("requests is not installed")

    form_files = []
    opened = []
    try:
        for filename, path in files:
            fh = path.open("rb")
            opened.append(fh)
            form_files.append(("files", (filename, fh, "application/pdf")))

        # Send the JSON payload as a multipart field (filename=None). Passing it
        # via files= instead of data= forces multipart/form-data even when no PDFs
        # are attached; data={...} with an empty files list encodes as
        # application/x-www-form-urlencoded, which staging rejects with HTTP 400
        # "Supported content-type: multipart/form-data".
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
        text = response.text
        try:
            body = response.json()
        except Exception:
            body = text
        return {"status_code": response.status_code, "ok": response.ok, "response": body}
    finally:
        for fh in opened:
            try:
                fh.close()
            except Exception:
                pass
