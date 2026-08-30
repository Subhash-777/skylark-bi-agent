# Decision Log — Monday.com Business Intelligence Agent

## 1. Key assumptions

- **Board seeding is a one-time step, not runtime behavior.** The two CSVs were imported into monday.com once via a scripted setup step (`scripts/setup-boards.ts`); the deployed agent never reads the CSVs and queries monday.com dynamically at runtime, per the assignment's explicit "do not hardcode CSV data" requirement.
- **No clean cross-board join key exists.** `Deal Name` (Deals) and `Deal name masked` (Work Orders) share alias-style naming conventions (`Scooby-Doo`, `Alias_160`, etc.) but are non-unique across multiple rows. Joined on `(owner_code / bd_kam_personnel_code + sector)` as a best-effort match. The agent explicitly notes in cross-board answers that the join is approximate.
- **Fiscal period definition.** Standard Indian Fiscal Year starting April 1 (FY25-26 as present in invoice numbers like `SDPL/FY25-26/916`). "This quarter" queries default to Q4 FY25-26 (Jan-Mar 2026) or Calendar Quarter, with structured clarification offered when ambiguous.
- **Deduping deal-stage snapshots.** Each row in `deals_clean` is treated as a distinct pipeline snapshot event. When calculating unique deal counts, queries group by `(client_code, deal_name, sector_service)` to avoid overcounting snapshot updates.
- **Financial column validity.** Masked financial figures (`amount_excl_gst`, `billed_value_incl_gst`, etc.) preserve internal consistency (GST ratios hold ~18%). Aggregate arithmetic (sums, ratios) is mathematically valid on masked numbers.

## 2. Data-quality issues found and how they were handled

- **Phantom header rows as data**: Duplicated header rows in source exports (e.g. row 52 `Nezuko`, row 181 `Bugs Bunny` where column values equal header labels like `"Deal Status"`). Detected during sync via a multi-column header equality check and tagged with `is_phantom_row = TRUE`. All SQL queries enforce `WHERE is_phantom_row = FALSE`.
- **Sparse data coverage**:
  - `closure_probability`: Populated in only ~25% of deals rows.
  - `masked_deal_value`: Populated in ~48% of deals rows.
  - `collection_status`: 100% blank (176/176 rows) in Work Orders.
  - *Handling*: Per-column completeness percentages are tracked in `sync_log`. The `run_query` and `get_schema` tools instruct the LLM to output explicit coverage footnotes whenever querying sparse columns (e.g. "Based on X of Y deals with recorded value").
- **Typo normalization**: `Billing Status` contained typo variants (`"BIlled"` alongside `"Billed"`). Normalized during sync using a case/synonym dictionary (`BIlled` -> `Billed`), plus SQL defensive ILIKE matching.
- **Work Orders header offset**: Row 1 of `Work_Order_Tracker_Data.xlsx` is blank; headers sit on row 2. Handled in `scripts/setup-boards.ts` by stripping leading blank rows before CSV header extraction.
- **Multi-value text tokenization**: `Product deal` contains freeform string combinations (`"Service + Spectra"`, `"Dock + DMO + Spectra + Service"`). Tokenized into a relational side table `deal_products(deal_monday_item_id, product)` during sync, allowing exact product line aggregation.

## 3. Trade-offs chosen and why

- **Google Gemini 2.5 Flash API vs. Anthropic Claude**: Used Google Gemini 2.5 Flash via `@google/genai` SDK with native function calling and multi-turn tool loops. High performance on structured SQL generation and tool routing.
- **Code-execution (SQL-over-synced-mirror) vs. Context Prompt-Stuffing**: Chose Postgres mirror code execution. Asking an LLM to eyeball raw JSON for 346+176 rows leads to incorrect sums. Running Postgres SQL queries via `run_query` guarantees 100% mathematical accuracy.
- **Cron + Manual Refresh vs. Monday Webhooks**: Implemented automated 30-minute Vercel Cron (`/api/cron/sync`) plus a manual "Refresh Data" UI button. Webhook verification endpoints were deferred to avoid external signature secret setup complexity.
- **Markdown Export vs. PDF Renderer**: Implemented clean one-click Markdown file export on `/digest` and browser print-to-PDF, avoiding heavy node native canvas dependencies in Vercel serverless functions.

## 4. How "leadership updates" was interpreted

Interpreted as an interactive **Leadership Digest** dashboard (`/digest` and `/api/digest` endpoint), featuring:
1. **KPI Scorecard**: Won deals count & value, total work orders, total receivables, open vs closed AR breakdown.
2. **Proactive Anomaly Alerts**: Automatically flags Won deals missing Close Date and work orders marked billed with zero collected amount.
3. **Stalled Deals Tracker**: Top open deals stuck in stage without progress ordered by days open.
4. **Work Order Execution & Sector Pipeline Breakdown**: Tabular status distribution.
5. **One-Click Markdown Export**: Downloadable report for executive sharing.

## 5. What I'd do differently with more time

- **Real-time Webhook Sync**: Add monday.com challenge-response webhook receiver for instant sub-second board update sync.
- **Fuzzy Entity Resolution**: Build an ML/embedding-based entity resolution model to link Deals and Work Orders across non-exact client name aliases.
- **Role-Based Access Control**: Add authentication (Clerk / NextAuth) to restrict access to financial figures.
- **Native PDF Generation**: Integrate server-side PDF generation via Puppeteer / `@react-pdf/renderer`.

## 6. AI tools used in this build

- **Google Gemini 2.5 Flash**: Agent model powering the `run_query`, `get_schema`, `list_known_data_issues`, and `build_digest` tool loops.
- **Antigravity AI Assistant**: Pair-programming assistant used for code generation, Next.js architecture setup, database schema design, and data resilience pipeline logic. Every SQL query string and tool interface was verified against actual Postgres execution results.
