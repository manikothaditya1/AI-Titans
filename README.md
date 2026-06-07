# AI Titans — Document-First Notary Booking Assistant

Built for **START Hack Vienna 2026** as part of the **notarity** challenge: **“Zero to notary appointment in 3 minutes.”**

Our goal is to make a complex legal booking flow feel simple for users who do not know legal workflows upfront. Instead of asking users to understand notarial products, country rules, participant logic, billing, shipping, consents, and time-slot requirements, our assistant starts from what most users already have: **the document**.

---

## Team

**Team name:** AI Titans  
**Team lead:** Aditya Manikoth

**Team members:**

- Milan Paul
- Bushra Ilyas Qureshi
- Desire Khurana

---

## Demo Video

Watch our 3-minute demo video here:

[AI Titans Notarity Demo Video](https://youtu.be/sHVpEep0qsA)

---

## Challenge

notarity’s appointment booking flow includes many moving parts:

- Country-specific rules
- Product catalog selection
- Participant setup
- Uploaded documents
- Appointment time slots
- Billing details
- Shipping preferences
- Consent and terms acceptance
- Preferred notary and language choices
- Conditional questions based on the selected product

The challenge was to reimagine this as an AI-enabled flow that helps a client complete a valid, fully configured notary appointment in under 3 minutes.

---

## Our Solution

**AI Titans built a document-first booking assistant for notarity.**

The user can upload one or more documents, and the system analyzes them to identify the likely notarial product, extract useful booking information, detect missing fields, and guide the user through only the required follow-up questions.

The final flow helps the user move from document upload to appointment confirmation without needing to understand legal product categories beforehand.

---

## Key Features

### Document-first flow

Users begin by uploading a document instead of manually selecting a legal product. The assistant analyzes the document and recommends the most likely notarity product.

### AI-assisted document analysis

The backend extracts text from uploaded PDF and DOCX files and uses AI-supported logic to detect:

- Document type
- Likely notarial product
- Country of use
- Appointment language
- Number of signers or participants
- Missing information required for booking

If no AI key is configured, the backend still supports a rule-based fallback so the demo remains usable.

### Smart follow-up questions

The assistant asks only the questions needed for the selected product and booking context. This avoids showing users a long, confusing form when only a few details are missing.

### Multi-document support

The flow supports up to 5 uploaded documents, allowing users to prepare multiple notarization requests in one booking flow.

### Guided booking completion

The app guides the user through the required booking steps:

1. Landing page
2. Document upload or manual product selection
3. Document analysis
4. Product confirmation
5. Required questions
6. Participants and extra participant emails
7. Appointment time slot
8. Billing and contact details
9. Review
10. Payment or direct confirmation
11. Booking JSON download / appointment submission

### Side chatbot for user support

A small assistant is available in the interface to answer common user questions, such as which country to select, what a field means, and what information is required.

### Connected Notarity staging flow

The backend includes endpoints for working with notarity-related booking form, product, pricing, time-slot, and appointment request logic.

---

## Tech Stack

### Frontend

- React
- TypeScript
- TanStack Router / TanStack Start
- Vite
- Tailwind CSS
- Radix UI components

### Backend

- Python
- FastAPI
- Uvicorn
- Pydantic
- pypdf
- python-docx
- OpenAI API support
- Rule-based fallback extraction
- Notarity staging API integration helpers

---

## Project Structure

```text
latest_claude/
├── backend/
│   ├── main.py
│   ├── notarity_staging.py
│   ├── requirements.txt
│   ├── data/
│   └── uploads/
│
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── components/
│   │   ├── data/
│   │   ├── lib/
│   │   └── routes/
│   └── vite.config.ts
│
└── README.md
```

---

## Backend API Overview

### Health check

```http
GET /health
```

Checks whether the backend is running.

### Analyze documents

```http
POST /analyze-documents
```

Accepts multipart file uploads through the `files` field. Supports 1 to 5 files.

Returns extracted document information, detected product hints, autofill data, and missing questions.

### Finalize booking

```http
POST /finalize-booking
```

Validates the current booking draft and builds the final booking payload.

Returns either:

- `ready_to_book`, if all required fields are complete
- `missing_fields`, if more information is needed

### Download booking JSON

```http
GET /download-booking/{booking_id}
```

Downloads the generated booking payload as JSON.

### Notarity price endpoint

```http
POST /notarity/price
```

Builds the notarity-compatible appointment request payload and requests pricing information.

### Submit appointment request

```http
POST /notarity/submit-appointment-request
```

Builds the final notarity appointment request payload, attaches uploaded files, and submits the request to the staging appointment endpoint.

---

## How to Run Locally

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd <your-repository-folder>/latest_claude
```

---

### 2. Start the backend

```bash
cd backend
python -m venv .venv
```

On macOS or Linux:

```bash
source .venv/bin/activate
```

On Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the backend:

```bash
uvicorn main:app --reload --port 8000
```

The backend should now be available at:

```text
http://localhost:8000
```

API docs:

```text
http://localhost:8000/docs
```

---

### 3. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend should now be available at the local Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

---

## Environment Variables

### Backend

Create a `.env` file inside the `backend` folder.

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.4-mini
```

The OpenAI key is optional for demo fallback mode. If no key is provided, the system uses rule-based extraction.

### Frontend

Create a `.env` file inside the `frontend` folder.

```env
VITE_API_BASE_URL=http://localhost:8000
```

---

## Security Note

Do not commit real API keys, tokens, `.env` files, virtual environments, or generated upload data to the public GitHub repository.

Before submitting the project, make sure the repository excludes:

```text
backend/.env
backend/.venv/
backend/uploads/
backend/data/
frontend/.env
node_modules/
```

If any real API key or token was committed or shared publicly, rotate it before final submission.

---

## Demo Story

A user arrives at the booking page and does not know which notarial service they need. They only have a document.

They upload the document. The assistant reads it, detects the likely product, identifies the country of use, and asks only the missing questions needed to complete the booking. The user confirms participants, chooses an appointment slot, enters billing and contact details, accepts the required consent, and reaches a valid appointment request flow.

The result is a faster, clearer, and less intimidating booking experience for legal documents.

---

## Judging Alignment

### Functional MVP

The app supports a realistic end-to-end booking flow, including document upload, product recommendation, required questions, booking validation, pricing, and appointment request submission logic.

### Technical execution

The system separates frontend, backend, document analysis, booking-state handling, and notarity API integration. The code is structured around clear API endpoints and reusable frontend routes/components.

### User experience and design

The flow reduces legal complexity by guiding users step by step and showing only context-relevant questions.

### Pitch and storytelling

The core story is simple: users should not need to understand legal workflows to book a notary appointment. They should be able to start with their document and be guided to a valid booking.

---

## Hackathon Context

This project was created for the **notarity track** at **START Hack Vienna 2026**.

The challenge: **Make a complex booking flow feel simple.**

The target: **A valid notary appointment flow in under 3 minutes.**

---

## Status

This is a hackathon MVP. The current version focuses on demonstrating the document-first booking experience, guided AI-supported flow, and connection-ready appointment request architecture.
