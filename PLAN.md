# PLAN — Monday.com Business Intelligence Agent (Skylark Drones Assignment)

This is the master plan. `ANTIGRAVITY_KICKSTART_PROMPT.md` is what you paste into Antigravity — it tells the agent to read *this* file as its spec. `DECISION_LOG_TEMPLATE.md` is the pre-filled deliverable you edit at the end.

---

## 1. What's actually in the data (verified by inspection, not guessed)

I opened both CSVs directly. This matters because "handle messy data gracefully" is graded, and the mess is specific — not generic.

### Deals board — `Deal_funnel_Data.xlsx` (346 data rows, 12 columns)
`Deal Name, Owner code, Client Code, Deal Status, Close Date (A), Closure Probability, Masked Deal value, Tentative Close Date, Deal Stage, Product deal, Sector/service, Created Date`

- **Deal Status**: `Won` 165, `Dead` 127, `Open` 49, `On Hold` 2, blank 1 — plus **2 rows where the value is literally the string `"Deal Status"`** (a duplicated header row got concatenated into the data body — same for `Deal Stage`, `Sector/service`, `Closure Probability` columns in those same rows). **The agent must detect and drop these phantom header-rows-as-data**, not just filter on null.
- **Deal Stage**: 16 distinct stage labels, inconsistently ordered/prefixed (`A.` through `O.`, plus two free-text stages `Project Completed` and one truncated `Deal Stage` garbage value). A stage → funnel-order mapping needs to be built, it isn't implicit in the string.
- **Closure Probability**: 258/346 rows (75%) are **blank**. Any "average closure probability" query must state this coverage gap, not silently average over the 88 populated rows as if it's the whole book.
- **Masked Deal value**: 181/346 blank (52%). Revenue/pipeline-value questions must exclude nulls explicitly and say so — a naive `SUM()` would understate nothing, but a naive `AVG()` or "how many deals" framing next to a $ figure would mislead.
- **Close Date (A)** (actual close date): 318/346 blank — expected, since most deals aren't closed; only closed-won/closed-lost rows should have it. Worth a sanity check the agent should run (any `Won` row missing Close Date is itself a data-quality flag).
- **Sector/service**: 12 categories incl. a catch-all `Others` (28 rows) and 8 blank. `Mining` (106) and `Renewables` (111) dominate.
- **Product deal**: 170/346 blank, and populated values are **freeform combos** (`"Service + Spectra"`, `"Dock + DMO + Spectra + Service"`, `"Pure Service"`, `"Hardware"`) — this is a multi-select crammed into one text field. Needs tokenizing (split on `+`) if the agent ever needs to answer "which product lines are winning."
- Some `(Owner code, Client Code)` pairs repeat across multiple rows with different `Deal Stage`/`Tentative Close Date` — i.e. the same underlying deal appears to be tracked across pipeline-stage snapshots rather than one row per deal. **Do not assume 1 row = 1 deal** when counting "how many deals with COMPANY_X" — dedupe logic needs a documented assumption (see Decision Log).

### Work Orders board — `Work_Order_Tracker_Data.xlsx` (176 data rows, 38 columns)
Header sits on **row 2** of the raw sheet (row 1 is fully blank) — a naive `pandas.read_csv()` with default header row will silently misparse this file. Confirm the header offset when building the import script.

- **Execution Status**: `Completed` 117, `Ongoing` 25, `Not Started` 11, `Executed until current month` 12 (recurring contracts), `Pause / struck` 4, `Partial Completed` 2, blank 4.
- **Collection status** column: **100% blank (176/176)** — the column exists but was never populated in this export. Any "collections" query has to fall back to `Collected Amount in Rupees` / `Amount Receivable` and say so, and must not silently treat "blank status" as "not collected."
- **Billing Status** free-text field contains a literal typo variant `"BIlled"` alongside `"Billed"`-adjacent values elsewhere — string matching on billing status needs case-insensitive/fuzzy handling, not exact match.
- **WO Status (billed)**: 74/176 blank, `Closed` 78, `Open` 24.
- Financial columns (`Amount in Rupees (Excl/Incl of GST)`, `Billed Value...`, `Collected Amount...`, `Amount to be billed...`, `Amount Receivable...`) are **masked but internally consistent** (Incl ≈ Excl × ~1.18, i.e., GST is really applied to the masked numbers) — safe to do ratio/aggregate math on them, just don't treat "masked" as "fake/random."
- `AR Priority account` populated only 10/176 times (`Priority` flag) — sparse but meaningful when present; treat non-null as a boolean flag, not a category to tally against blanks.
- Sector values here (`Mining`, `Powerline`, `Renewables`, `Railways`, `Construction`, `Others`) are a subset of the Deals sector list — good, this is the join key.
- **Join key across boards**: neither board shares a clean primary key. `Deal name masked` (Work Orders) and `Deal Name` (Deals) use the *same first-name-style aliases* (`Sakura`, `Alias_160`, etc.) but these are **not unique** — many rows share a name. The only remotely reliable cross-board join is `(Owner/BD-KAM code, Sector, approximate date range)` as a fuzzy match, not a hard join. **Flag this as an explicit assumption in the Decision Log** — don't let the agent quietly pretend it has a clean join.

### Practical consequence for the build
Because ~30–75% of key columns are null in places, and because there are literal garbage rows and a typo'd status value, **the agent must never compute a number silently** — every quantitative answer needs a one-line data-coverage footnote ("based on 88 of 346 deals with a recorded probability"). This is built into the architecture below (§5, "Trust Score"), not left as a prompting afterthought.

---

## 2. Scope mapped to the assignment's required areas

| Assignment requirement | How this plan satisfies it |
|---|---|
| 1. Monday.com Integration | Direct monday.com GraphQL API (`api.monday.com/v2`), read-only token. See §4. |
| 2. Data Resilience | Typed sync/normalization layer that fixes the specific issues in §1 before anything reaches the LLM. See §5. |
| 3. Query Understanding | Claude tool-use agent loop with a structured clarification step (not just prose questions). See §6. |
| 4. Business Intelligence | Code-execution answer engine (SQL over a synced Postgres mirror) instead of asking the LLM to eyeball numbers from raw JSON. See §5–6. |
| Optional: leadership updates | "Leadership Digest" generator — one-click structured report with anomaly callouts, exportable. See §7. |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js 14 (App Router) — single repo, single Vercel deploy      │
│                                                                     │
│  /app/chat            → conversational UI (Vercel AI SDK, SSE)     │
│  /app/digest           → Leadership Digest view + PDF/MD export    │
│  /app/api/chat         → agent loop endpoint (Gemini tool use)     │
│  /app/api/sync         → pulls monday.com boards → Postgres mirror │
│  /app/api/cron/sync    → Vercel Cron, re-syncs on a schedule       │
└───────────────┬─────────────────────────────┬─────────────────────┘
                │                               │
                ▼                               ▼
                                        └───────────────────────────────┘
```

**Core architectural decision:** the LLM never does arithmetic on raw text. It writes a parameterized SQL query (or picks one from a small library of vetted query templates), the app executes it against the synced-and-cleaned Postgres tables, and the LLM narrates the *result*. This is the single biggest reliability lever for a BI agent — it is also the most defensible "novel" architectural choice to describe in an interview: most naive submissions will paste raw monday.com JSON into the prompt and ask the LLM to "analyze" it, which silently produces wrong sums on 346+176 rows. This plan avoids that failure mode by construction.

---

## 4. Tech stack (with justification)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14, TypeScript, App Router** | One repo, one Vercel deploy — no separate backend to host/CORS. Server Actions + Route Handlers do everything a Python backend would. |
| LLM | **Google Gemini API** (`gemini-2.5-flash`), native tool use via `@google/genai` SDK | Free-tier access with robust function-calling and streaming support; tool-calling loop is a first-class feature, no extra agent framework needed for a 6-hour build. |
| Agent orchestration | Hand-rolled loop via `@google/genai`, **not** LangChain | LangChain adds abstraction overhead that costs debugging time you don't have in a 6-hour window; a manual `while (has_tool_calls)` loop is ~40 lines and fully inspectable — good to show in the README/Decision Log. |
| Monday.com access | **Direct GraphQL API** (`api.monday.com/v2`) via server-side fetch, read-only token | The assignment explicitly allows "MCP or API — your choice." Direct API is simpler to run reliably inside a stateless serverless function than spinning up an MCP process, and it's what actually needs to run in production, not just in your dev IDE. |
| Database | **Supabase Postgres (free tier)** | Needed for the code-execution BI pattern in §3 — SQL aggregation must run against real tables, not JSON blobs. Supabase gives a hosted Postgres with zero ops in minutes. |
| Data sync | Server route + Vercel Cron (e.g. every 30 min) + manual "Refresh data" button in the UI | Keeps the mirror fresh without requiring monday.com webhooks (which need a public verified endpoint + signature checks — doable but optional; document as a "with more time" item). |
| Frontend chat | Custom SSE streaming with React hooks | Handles streaming, tool-call UI states, and message history. Uses Gemini's native streaming support. |
| Charts | **Recharts** | Inline bar/line charts rendered directly in chat answers when a query is naturally visual (e.g., pipeline by stage). |
| PDF export | **`@react-pdf/renderer`** (or Markdown + browser print-to-PDF if time is short) | For the Leadership Digest deliverable. |
| Caching (optional) | **Upstash Redis (free tier)** | Cache monday.com raw responses between syncs; not required for MVP. |
| Hosting | **Vercel** (frontend + API routes + cron), **Supabase** (DB) | Both have generous free tiers, both deploy in minutes, both give you a public HTTPS URL — satisfies "hosted, testable without local setup" directly. |
| Error tracking (optional) | **Sentry free tier** | Nice-to-have if time allows; otherwise structured `console.error` + Vercel logs is enough for a 6-hour assignment. |

**Environment variables needed:**
```
GEMINI_API_KEY=                # Google Gemini API key (free tier at ai.google.dev)
MONDAY_API_TOKEN=              # read-only personal token, Developer > My Access Tokens
MONDAY_DEALS_BOARD_ID=
MONDAY_WORK_ORDERS_BOARD_ID=
DATABASE_URL=                  # Supabase connection string (pooled, for serverless)
CRON_SECRET=                   # protects /api/cron/sync from public calls
```

---

## 5. Data resilience layer (this is where "graceful handling" actually lives)

A `sync` step does the following, in order, every time it runs — this is a deterministic pipeline, not an LLM call:

1. **Pull** all items + column values for both boards via GraphQL (`items_page` with pagination — boards this size fit in 1–2 pages but write it paginated anyway, it's the same code either way).
2. **Strip phantom rows**: drop any row where a categorical column's value equals that column's own header text (the concrete bug found in §1) — a generic check (`value == header_label`), not a hardcoded string, so it also catches this pattern elsewhere.
3. **Normalize categoricals**: trim whitespace, fix case (`BIlled` → `Billed`), collapse near-duplicate labels via a small synonym map you build from the actual observed values in §1 (don't invent a generic fuzzy-matcher for a 6-hour build — a lookup table covering the ~5 known typos is enough, and is honest to document as "known issues handled" rather than "solved in general").
4. **Type coercion**: dates → `date`/`timestamp`, masked currency strings → `numeric`, leave genuinely-blank fields as SQL `NULL` (never coerce blank to 0 — a null deal value is "unknown," not "zero," and that distinction is exactly what a founder needs preserved).
5. **Tokenize multi-select-in-text fields** (`Product deal`) into a side table (`deal_products(deal_id, product)`) split on `+`.
6. **Compute a per-column completeness stat** and store it in `sync_log` (e.g. `closure_probability_pct_populated = 0.25`). This feeds the "Trust Score" footnote (§6) without recomputing it per-query.
7. **Upsert** into `deals_clean` / `work_orders_clean`, keyed by monday.com item ID (stable), so re-syncs are idempotent.

---

## 6. Agent design

**Tools exposed to Gemini:**
- `get_schema()` — returns the cleaned table/column definitions + per-column completeness % (from `sync_log`), so the model knows what exists and how trustworthy it is *before* writing a query.
- `run_query(sql: string)` — executes a **read-only** SQL statement against the mirror (reject anything that isn't `SELECT`; use a Postgres role with `SELECT`-only grants as a second line of defense, not just an app-level string check).
- `list_known_data_issues()` — returns the curated list from §1/§5 (blank Collection status, sparse Closure Probability, no clean cross-board key, etc.) so the model can proactively caveat answers that touch those columns instead of guessing.
- `build_digest(period)` — assembles the structured Leadership Digest payload (§7) as data; formatting/export happens in the UI layer, not inside the tool.

**Query-understanding / clarification:**
- Before running ambiguous queries (e.g. "this quarter" with no fiscal-year anchor stated anywhere in the data, or a sector name that doesn't exactly match one of the known categories), the agent asks a **structured** clarifying question — the UI renders 2–4 quick-reply chips generated from the actual distinct values in the relevant column (e.g. real sector names), not a free-text "please clarify" dead end.
- Multi-turn context: the agent loop keeps prior turns' resolved filters (sector, date range, owner) so "now break that down by owner" works without the user restating everything.

**Every answer that includes a number carries:**
1. The number/table/chart itself.
2. A one-line coverage note when relevant fields have material nulls ("38 of 106 Mining deals have no recorded value; this total excludes them").
3. A collapsible "Show query" affordance revealing the exact SQL that produced it — this is the audit/drill-down feature and it's cheap to build since the SQL already exists as a tool-call argument.

---

## 7. "Novel" features (beyond the baseline four requirements)

Prioritized — build top-to-bottom, cut from the bottom if time runs short:

1. **Code-execution BI core** (§3/§6) — the single biggest differentiator from a "chatbot glued to an API" submission.
2. **Per-answer Trust Score / coverage footnote** (§6) — turns "handle missing data gracefully" from a prompt instruction into a visible, verifiable product feature.
3. **Query audit trail / "show your work"** — click any answer to see the SQL and the exact row count behind it.
4. **Leadership Digest generator** — one command (`/digest` or a button) produces: pipeline by stage & sector, revenue won this period, top stalled deals (in a stage >X days with no movement — computable from `Created Date`/`Tentative Close Date` deltas), work-order execution status summary, AR/receivables aging from the Work Orders numbers, and a short narrated "what changed" summary. Exportable as PDF/Markdown.
5. **Proactive anomaly surfacing** — even when not asked, flag things like "3 Won deals have no Close Date recorded" or "12 work orders marked Fully Billed but Collected Amount is blank" as a footer on relevant answers — genuinely useful for a founder and directly demonstrates understanding of the specific dataset.
6. **Structured clarification chips** instead of plain-text clarifying questions (§6).
7. **Manual "Refresh data" + last-synced timestamp** visible in the UI, on top of the cron sync — so a demo/interview reviewer can force a fresh pull live.

Cut-if-short, in order: (7) → webhook-based sync instead of cron-only is already optional and not in this list; (5) anomaly surfacing → (4) PDF export (keep Markdown-only digest) → (3) audit trail collapses to "query shown always" rather than collapsible UI polish.

---

## 8. Build phases (fits a ~5–6 hour window)

| Phase | Time | Output |
|---|---|---|
| 0. Setup | 20 min | monday.com boards created + CSVs imported (see kickstart prompt §"Board setup"); Supabase project created; Vercel project linked; env vars set. |
| 1. Data layer | 60–75 min | GraphQL fetch working; cleaning pipeline (§5) implemented; `deals_clean`/`work_orders_clean` populated; `sync_log` populated; manual verification that the phantom-header rows are gone and null counts roughly match §1. |
| 2. Agent core | 75–90 min | `/api/chat` route with the tool loop (§6); `run_query` sandboxed to `SELECT`; 8–10 hand-tested queries covering revenue, pipeline-by-stage, sector performance, work-order status, receivables — confirm numbers are sane against a manual spot-check in the CSV. |
| 3. Chat UI | 45–60 min | `useChat` page, streamed tool-call visibility, inline chart rendering for pipeline/sector questions, clarification chips. |
| 4. Leadership Digest | 45 min | `/digest` page + `build_digest` tool + Markdown/PDF export. |
| 5. Trust/audit polish | 20–30 min | Coverage footnotes, "show query" toggle. |
| 6. Deploy + smoke test | 20 min | Push, verify the public URL cold-loads and answers 3 sample questions correctly. |
| 7. Decision Log + README | 30 min | Fill `DECISION_LOG_TEMPLATE.md`, write README (setup, architecture, AI tools used, trade-offs). |

---

## 9. Deliverables checklist (map directly to the assignment)

- [ ] Public hosted URL (Vercel), loads without local setup
- [ ] GitHub repo, public, source + README
- [ ] README: architecture overview, monday.com board setup/config steps, env vars, how to run locally
- [ ] Decision Log (≤2 pages): assumptions, trade-offs, what you'd change with more time, your interpretation of "leadership updates"
- [ ] Confirm: agent queries monday.com dynamically at runtime — **no hardcoded CSV data anywhere in the shipped app** (the CSVs are only used once, to seed the monday.com boards)
- [ ] Submit via the Google Form with all links verified public (open the hosted URL in an incognito window before submitting)
