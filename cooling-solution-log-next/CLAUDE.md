# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run lint      # ESLint validation
```

No test suite exists in this project.

## Environment Setup

Create `.env.local` with:
```
APP_PIN=1234                         # 4-digit PIN for authentication
ANTHROPIC_API_KEY=sk-ant-api03-...   # Claude AI (required)
ANTHROPIC_MODEL=claude-...           # Model ID
GOOGLE_CLIENT_ID=...                 # Google Drive sync (optional)
GOOGLE_CLIENT_SECRET=...             # Google Drive sync (optional)
OPENAI_API_KEY=...                   # Alternative LLM (optional)
GOOGLE_GENERATIVE_AI_KEY=...         # Gemini alternative (optional)
```

## Architecture

**What it is:** A local-first business management app for a cooling/HVAC company. All data lives in browser IndexedDB (Dexie). Google Drive is optional cloud backup only — there is no backend database.

**Routing:** The app uses a single Next.js page (`app/page.tsx`) with React state to switch between feature components. There is no Next.js file-based routing for features — only API routes use the `app/api/` directory.

**Authentication:** `AuthGuard.tsx` wraps the entire app. A 4-digit PIN is validated via `POST /api/auth/pin`, which checks against `APP_PIN` env var. A base64 session token is stored in `localStorage` for 24 hours.

### Key Files

| File | Purpose |
|------|---------|
| `lib/db.ts` | Dexie (IndexedDB) database — all table schemas and migrations |
| `lib/types.ts` | All TypeScript interfaces shared across the app |
| `lib/pdfGenerator.ts` | Client-side PDF generation (invoices, P&L, AR reports) using jsPDF |
| `lib/googleDrive.ts` | Google OAuth flow and Drive backup/restore |
| `app/page.tsx` | Main client-side router — controls which feature component renders |
| `app/api/chat/route.ts` | Routes chat messages to Claude/OpenAI/Gemini; intercepts keywords to trigger report generation |
| `app/api/analyze-photo/route.ts` | Sends receipt photos to Claude, extracts structured expense data |
| `components/ChatCapture.tsx` | Core AI chat UI — handles streaming, photo capture, and action dispatch |

### Data Layer (Dexie)

Database name: `CoolingSolutionDB`. Schema is versioned — always add new tables/indexes via a new `db.version(N).stores({...})` call, never modify existing version blocks.

Primary tables: `clients`, `client_locations`, `jobs`, `invoices`, `events` (income/expenses), `employees`, `vehicles`, `appointments`, `notes`, `reminders`, `contracts`, `warranties`, `bitacora`, `job_templates`, `bank_statements`, `bank_transactions`, `product_prices`, `client_photos`, `client_documents`.

### Chat → Action Flow

`/api/chat/route.ts` sends the user message to the configured LLM, but first checks for Spanish-language keywords and returns typed action objects instead of text:
- `"p&l"` → `{type: 'GENERATE_PL', period}`
- `"quien me debe"` → `{type: 'GENERATE_AR'}`
- `"conciliacion"` → `{type: 'RUN_RECONCILIATION'}`

`ChatCapture.tsx` handles these typed responses by calling `pdfGenerator` functions or triggering reconciliation logic directly on the client with IndexedDB data.

### PDF Generation

All PDFs are generated client-side in `lib/pdfGenerator.ts` using jsPDF + jspdf-autotable. The file is very large (~118KB). Functions export: invoices, P&L statements, AR aging reports, income summaries, etc.

### Styling

Dark theme with Tailwind CSS v4. Primary color: `text-cyan-400`. Background: `bg-[#0b1220]` (page) and `bg-[#111a2e]` (cards). Borders: `border-white/20`.

Path alias `@/*` maps to the project root.
