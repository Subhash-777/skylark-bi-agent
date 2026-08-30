# Decision Log — Monday.com Business Intelligence Agent

*(Fill in every `[TODO]` after the build. Keep this to 2 pages — cut detail from the "trade-offs" and "with more time" sections first if it runs long; keep the data-handling and leadership-update sections complete since those map directly to graded requirements.)*

## 1. Key assumptions

- **Board seeding is a one-time step, not runtime behavior.** The two CSVs were imported into monday.com once via a scripted setup step (`scripts/setup-boards.ts`); the deployed agent never reads the CSVs and queries monday.com dynamically at runtime, per the assignment's explicit "do not hardcode CSV data" requirement.
- **No clean cross-board join key exists.** `Deal Name` (Deals) and `Deal name masked` (Work Orders) share an alias-style naming convention but are not unique identifiers — [TODO: state exactly what join strategy you implemented, e.g. "joined on (Owner/BD-KAM code + Sector) as a best-effort match, and the agent states when a cross-board answer relies on this approximate join"].
- **Fiscal period definition.** The data has no explicit fiscal-year field; "this quarter" queries assume [TODO: calendar quarter / Indian FY starting April — state which you picked and why].
- **Deduping deal-stage snapshots.** Some (Owner, Client) pairs recur across multiple rows at different pipeline stages. [TODO: state whether you treated each row as a distinct pipeline event or deduped to "latest stage per client," and why].
- [TODO: any other assumption you had to make and didn't get to ask about]

## 2. Data-quality issues found and how they were handled

*(This section should read as evidence you actually inspected the data, not generic disclaimers — see `PLAN.md` §1 for the source findings.)*

- Phantom rows where a categorical value equals its own column header (artifact of a duplicated header row in the source export) — detected and dropped during sync via [TODO: describe the check you implemented].
- `Closure Probability` populated in only ~25% of Deals rows; `Masked Deal value` populated in ~48%; `Collection status` in Work Orders is 100% blank. [TODO: describe how the agent surfaces coverage — e.g. "coverage footnote appended to any answer touching these columns"].
- `Billing Status` free-text values include at least one typo variant (`"BIlled"`). [TODO: state whether you normalized via a lookup table or left it and relied on the LLM's SQL to `ILIKE`-match].
- Work Orders CSV header sits on row 2, not row 1, of the raw export — handled at parse time in the one-time import script.
- `Product deal` is a freeform multi-value text field (values joined with `+`). [TODO: state whether/how you tokenized it].

## 3. Trade-offs chosen and why

- **Direct monday.com GraphQL API vs. MCP.** [TODO: confirm which you shipped and one sentence on why — see `PLAN.md` §4 for the reasoning already drafted].
- **Code-execution (SQL-over-synced-mirror) vs. prompt-stuffing raw board data into the LLM context.** Chose the former for numeric reliability at this data volume (346 + 176 rows would silently produce wrong sums/averages if the LLM were asked to eyeball them from JSON). Cost: an extra sync/ETL layer and a Postgres dependency instead of a purely stateless agent.
- **Cron-based sync vs. monday.com webhooks.** [TODO: state which you shipped; webhooks give lower staleness but need a public signed endpoint — reasonable to defer to "with more time" if you shipped cron/manual-refresh only].
- **PDF export vs. Markdown-only digest.** [TODO: state which you shipped and why, if cut for time].
- [TODO: any other trade-off, e.g. scope cuts from `PLAN.md` §7's priority list]

## 4. How "leadership updates" was interpreted

The assignment leaves this open. This build interpreted it as: a **Leadership Digest** — a single generated view combining pipeline health by stage/sector, revenue/value closed in-period, work-order execution status, receivables/AR aging signals, and a short narrated "what changed" summary, plus proactively-surfaced anomalies (e.g. stalled deals, billed-but-uncollected work orders) that a founder would want flagged without having to ask. [TODO: confirm this is what you shipped, note anything you added/cut, e.g. export format, scheduling of digests, etc.]

## 5. What I'd do differently with more time

- [TODO — pull from `PLAN.md` §7's "cut if short" list plus anything else that surfaced during the build: webhook-based sync, general fuzzy-matching instead of a hardcoded typo lookup table, a real fuzzy cross-board entity-resolution model instead of the approximate join, auth/access control on the public demo URL given it's client data, automated tests around the SQL-generation tool, etc.]

## 6. AI tools used in this build

[TODO: name the tools — e.g. Claude in Antigravity for the full build, ChatGPT/etc. if used for anything specific — and one honest sentence on what you had to correct or redo by hand, since the assignment explicitly asks you to be able to explain your implementation, not just that AI produced it.]
