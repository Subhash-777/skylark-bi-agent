# Skylark Drones — Monday.com Business Intelligence Agent

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Hosted_Live-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://skylark-bi-agent.vercel.app)
[![Tech Stack](https://img.shields.io/badge/Next.js_14-Gemini_2.5_Flash-3b82f6?style=for-the-badge&logo=next.js&logoColor=white)](https://skylark-bi-agent.vercel.app)

A production-hosted AI Agent for querying monday.com Deals Pipeline and Work Order data in natural language, built with Next.js 14, Google Gemini 2.5 Flash (`@google/genai`), Supabase Postgres, and TypeScript.

👉 **Live Hosted Application**: [https://skylark-bi-agent.vercel.app](https://skylark-bi-agent.vercel.app)  
👉 **Interactive Architecture Explainer**: [https://skylark-bi-agent.vercel.app/about](https://skylark-bi-agent.vercel.app/about)

---

## 🌟 Key Differentiators & Shipped Features

1. **Code-Execution BI Core (SQL Over Synced Mirror)**: The LLM does **not** compute numbers by prompt-stuffing raw JSON. Instead, it inspects schemas via `get_schema()` and generates parameterized SQL queries executed via `run_query()` against a Postgres mirror synced from monday.com.
2. **First 10-Second First Impression (`/`)**: High-impact landing page featuring live metric scorecards, 4 quick-start query chips that jump directly into `/chat` pre-filled, and architectural highlights.
3. **Interactive Recharts Visualization**: Structured query outputs automatically render dynamic, interactive Bar and Doughnut charts right inside assistant chat bubbles.
4. **Deterministic Data Resilience Pipeline**:
   - **Phantom Header Row Elimination**: Duplicated header rows in source exports (e.g. `Nezuko`, `Bugs Bunny` where values equal header names) are detected and filtered (`is_phantom_row = FALSE`).
   - **Typo Normalization**: Normalizes freeform typos like `"BIlled"` → `"Billed"`.
   - **Multi-Select Tokenization**: Tokenizes freeform `Product deal` strings (`"Service + Spectra"`) into a `deal_products` side table.
   - **Coverage & Trust Footnotes**: Automatically tracks per-column population % in `sync_log` and surfaces coverage warnings for sparse fields (e.g., `Closure Probability` ~25%, `Masked Deal Value` ~48%, `Collection Status` 100% blank).
5. **Executive Leadership Digest (`/digest`)**: Executive scorecard combining pipeline health by stage & sector, won revenue totals, top stalled open deals, work order execution status, AR receivables aging, automated anomaly detection, and **one-click Markdown export + crisp PDF print stylesheet (`window.print()`)**.
6. **Technical Explainer (`/about`)**: Live version of the Decision Log built into the web app for reviewers, breaking down the tool-calling loop, code-execution rationale, and the data resilience matrix.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js 14 (App Router) — Vercel Serverless                     │
│                                                                 │
│  /                    → Hero Landing Page + Pre-filled Query Chips│
│  /chat                → Conversational BI + Recharts Visualizer │
│  /digest              → Executive Digest Dashboard + PDF/MD     │
│  /about               → Technical Explainer & Decision Log      │
│  /api/chat            → Gemini Tool-Calling Agent Loop          │
│  /api/sync            → Monday.com → Postgres Sync Pipeline     │
│  /api/cron/sync       → Vercel Cron (30-min schedule)            │
└───────────────┬─────────────────────────────┬───────────────────┘
                │                             │
                ▼                             ▼
   ┌─────────────────────────┐   ┌─────────────────────────────┐
   │ Google Gemini API        │   │ monday.com GraphQL API v2   │
   │ (gemini-2.5-flash)      │   │ api.monday.com/v2           │
   │ Tools:                  │   │ read-only personal token    │
   │  - get_schema()         │   └───────────────┬─────────────┘
   │  - run_query(sql)       │                   │ sync
   │  - list_data_issues()   │                   ▼
   │  - build_digest()       │   ┌─────────────────────────────┐
   └─────────────┬───────────┘   │ Supabase Postgres           │
                 │ reads         │  deals_clean                │
                 └──────────────►│  work_orders_clean          │
                                 │  deal_products              │
                                 │  sync_log                   │
                                 └─────────────────────────────┘
```

---

## ⚙️ Environment Variables

Add the following environment variables to your `.env` file (or Vercel Environment Variables when deploying):

```env
# Google Gemini API key (from ai.google.dev)
GEMINI_API_KEY=your_gemini_api_key

# Monday.com Read-Only Personal API Token (Developer > My Access Tokens)
MONDAY_API_TOKEN=your_monday_api_token

# Monday.com Board IDs (generated during one-time setup)
MONDAY_DEALS_BOARD_ID=5030970037
MONDAY_WORK_ORDERS_BOARD_ID=5030970041

# Supabase Postgres Connection String (pooled connection)
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Cron endpoint secret
CRON_SECRET=skylark-sync-secret-2024
```

---

## 🛠️ Monday.com Board Setup & Seeding

The setup script creates the "Deals Pipeline" and "Work Order Tracker" boards on monday.com via the GraphQL API and seeds them with CSV data:

```bash
# Set credentials in .env and run:
npx tsx scripts/setup-boards.ts
```

> **Note**: Board seeding is a one-time setup step. The runtime web application never reads local CSVs and queries monday.com dynamically via GraphQL and the Postgres mirror.

---

## 🚀 Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Subhash-777/skylark-bi-agent.git
   cd skylark-bi-agent
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   Copy `.env` and fill in your credentials.

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000` in your browser.

---

## 🧪 Verification & Test Questions

The agent handles complex business intelligence questions out of the box:

1. **"How's our pipeline looking for the Mining sector?"**
   - *Tests*: Sector filtering + stage breakdown + coverage caveat on `masked_deal_value`.
2. **"What's our work order execution status across all sectors?"**
   - *Tests*: Cross-tabulation on `execution_status` × `sector`.
3. **"Which deals have been stuck without progress the longest?"**
   - *Tests*: Computed time delta (`CURRENT_DATE - created_date`), filtering out completed/lost deals.

---

## 🛠️ AI Tools Used

- **Google Gemini 2.5 Flash (`@google/genai`)**: Model used for multi-turn tool calling and SQL generation.
- **Antigravity AI Assistant**: Pair programming assistant used for codebase architecture, Next.js page development, and data cleaning pipeline construction.

---

## 📄 Deliverables & Documentation

- **Decision Log**: See [DECISION_LOG_TEMPLATE.md](file:///home/subhash/projects/Skylark_Drones/DECISION_LOG_TEMPLATE.md) for architectural trade-offs, key assumptions, data resilience findings, and leadership digest design.
- **Implementation Plan**: See [PLAN.md](file:///home/subhash/projects/Skylark_Drones/PLAN.md) for full assignment specification.
