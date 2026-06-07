# Notarity — Document-First Booking Assistant (connected MVP)

Frontend (TanStack Start + React) talks to a FastAPI backend over a small,
clearly-defined API. Mock AI is disabled; the frontend calls the real backend.
If no OpenAI key is set, the backend uses a reliable rule-based fallback so the
whole demo works offline.

## Run the backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Health check: http://localhost:8000/health · API docs: http://localhost:8000/docs

## Run the frontend
```bash
cd frontend
cp .env.example .env        # sets VITE_API_BASE_URL=http://localhost:8000
npm install                 # (or: bun install)
npm run dev                 # (or: bun run dev)
```

## Environment / config
- Frontend: `VITE_API_BASE_URL` (default `http://localhost:8000`).
- Backend (all optional): `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`).
  Without a key, rule-based extraction is used. Never put keys in the frontend.

## API endpoints
- `GET  /health` — backend status.
- `POST /analyze-documents` — multipart, field `files` (1–5). Returns
  `{ booking_id, files_count, analysed_documents[], autofill, missing_questions, status }`
  and writes `data/{booking_id}_analysis.json`.
- `POST /finalize-booking` — body `{ booking_id, draft }`. Validates required
  fields. Returns `ready_to_book` (+ `booking_payload`, writes
  `data/{booking_id}_booking_payload.json`) or `missing_fields`.
- `GET  /download-booking/{booking_id}` — downloads the booking JSON.

## Booking flow (no step skipped)
landing → upload/analysis (or product) → questions (apostille, delivery,
billing, appointment language, participants + extra participant emails, slot,
consents ×4 + terms) → validation → billing details + contact details →
review → payment (online) or straight to confirmation → **Download booking JSON**.
