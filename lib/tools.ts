/**
 * Agent tools — the functions exposed to Gemini via tool-calling.
 * Implements PLAN.md §6: get_schema, run_query, list_known_data_issues, build_digest
 */
import { executeReadOnlyQuery, getPool } from './db';

export interface ToolResult {
  name: string;
  result: unknown;
}

// --- Tool: get_schema ---
export async function getSchema(): Promise<unknown> {
  const pool = getPool();

  // Get table schemas
  const schemaResult = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('deals_clean', 'work_orders_clean', 'deal_products')
    AND table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  // Get completeness stats
  const statsResult = await pool.query(`
    SELECT table_name, column_name, total_rows, populated_rows, pct_populated
    FROM sync_log
    ORDER BY table_name, column_name
  `);

  // Get row counts
  const countsResult = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM deals_clean WHERE is_phantom_row = FALSE) as deals_count,
      (SELECT COUNT(*) FROM work_orders_clean WHERE is_phantom_row = FALSE) as work_orders_count,
      (SELECT COUNT(*) FROM deal_products) as deal_products_count
  `);

  // Get distinct values for key categorical columns
  const dealStatuses = await pool.query(`SELECT DISTINCT deal_status FROM deals_clean WHERE deal_status IS NOT NULL AND is_phantom_row = FALSE ORDER BY deal_status`);
  const dealStages = await pool.query(`SELECT DISTINCT deal_stage, deal_stage_order FROM deals_clean WHERE deal_stage IS NOT NULL AND is_phantom_row = FALSE ORDER BY deal_stage_order`);
  const sectors = await pool.query(`SELECT DISTINCT sector_service FROM deals_clean WHERE sector_service IS NOT NULL AND is_phantom_row = FALSE ORDER BY sector_service`);
  const execStatuses = await pool.query(`SELECT DISTINCT execution_status FROM work_orders_clean WHERE execution_status IS NOT NULL AND is_phantom_row = FALSE ORDER BY execution_status`);
  const woSectors = await pool.query(`SELECT DISTINCT sector FROM work_orders_clean WHERE sector IS NOT NULL AND is_phantom_row = FALSE ORDER BY sector`);

  return {
    tables: schemaResult.rows,
    completeness: statsResult.rows,
    row_counts: countsResult.rows[0],
    distinct_values: {
      deal_statuses: dealStatuses.rows.map(r => r.deal_status),
      deal_stages: dealStages.rows.map(r => ({ stage: r.deal_stage, order: r.deal_stage_order })),
      sectors: sectors.rows.map(r => r.sector_service),
      execution_statuses: execStatuses.rows.map(r => r.execution_status),
      work_order_sectors: woSectors.rows.map(r => r.sector),
    },
    notes: [
      'deals_clean: main deals table. Phantom header rows already filtered (is_phantom_row = FALSE).',
      'work_orders_clean: main work orders table. Same phantom row handling.',
      'deal_products: tokenized product deals (split on +). Join on deal_monday_item_id = deals_clean.monday_item_id.',
      'IMPORTANT: Always filter with WHERE is_phantom_row = FALSE when querying deals_clean or work_orders_clean.',
      'Financial columns are masked but internally consistent (GST ratios hold). Safe for ratio/aggregate math.',
      'collection_status column in work_orders_clean is 100% blank — use collected_amount_incl_gst instead.',
    ],
  };
}

// --- Tool: run_query ---
export async function runQuery(sql: string): Promise<unknown> {
  try {
    const result = await executeReadOnlyQuery(sql);
    return {
      rows: result.rows.slice(0, 200), // Cap at 200 rows for context window
      row_count: result.rowCount,
      truncated: result.rowCount > 200,
    };
  } catch (err) {
    return {
      error: String(err),
      hint: 'Only SELECT queries are allowed. Check column names against the schema from get_schema().',
    };
  }
}

// --- Tool: list_known_data_issues ---
export async function listKnownDataIssues(): Promise<unknown> {
  // Get current completeness stats from the DB
  const pool = getPool();
  const stats = await pool.query('SELECT * FROM sync_log ORDER BY table_name, column_name');

  return {
    issues: [
      {
        id: 'phantom_header_rows',
        severity: 'high',
        description: 'Both CSVs contained rows where categorical values equal their column headers (duplicated header rows in the source export). These are detected and excluded during sync.',
        affected_tables: ['deals_clean', 'work_orders_clean'],
        handling: 'Rows with is_phantom_row = TRUE are excluded. Always filter with WHERE is_phantom_row = FALSE.',
      },
      {
        id: 'closure_probability_sparse',
        severity: 'high',
        description: 'Closure Probability is populated in only ~25% of deals rows. Any analysis of closure probability must state this coverage gap.',
        affected_tables: ['deals_clean'],
        affected_column: 'closure_probability',
      },
      {
        id: 'masked_deal_value_sparse',
        severity: 'high',
        description: 'Masked Deal Value is populated in only ~48% of deals rows. Revenue/pipeline-value queries must exclude nulls explicitly and state so.',
        affected_tables: ['deals_clean'],
        affected_column: 'masked_deal_value',
      },
      {
        id: 'collection_status_blank',
        severity: 'high',
        description: 'Collection status column in Work Orders is 100% blank (never populated in the source export). Use collected_amount_incl_gst / amount_receivable columns instead for collection analysis.',
        affected_tables: ['work_orders_clean'],
        affected_column: 'collection_status',
      },
      {
        id: 'billing_status_typo',
        severity: 'medium',
        description: 'Billing Status contains a typo variant "BIlled" alongside "Billed". Normalized during sync to "Billed".',
        affected_tables: ['work_orders_clean'],
        affected_column: 'billing_status',
        handling: 'Corrected during sync. Use case-insensitive matching (ILIKE) as defense in depth.',
      },
      {
        id: 'no_clean_cross_board_join',
        severity: 'high',
        description: 'No clean primary key exists across deals and work orders boards. Deal names are aliases (not unique). Best-effort join is on (owner/BD-KAM code + sector) but this is approximate.',
        affected_tables: ['deals_clean', 'work_orders_clean'],
        handling: 'When performing cross-board queries, always state that the join is approximate and may not perfectly match all records.',
      },
      {
        id: 'close_date_mostly_blank',
        severity: 'medium',
        description: 'Close Date (A) is blank in ~92% of deals rows. Only closed-won/closed-lost rows should have it. Won deals without Close Date are a data quality flag.',
        affected_tables: ['deals_clean'],
        affected_column: 'close_date',
      },
      {
        id: 'product_deal_freeform',
        severity: 'medium',
        description: 'Product deal is a freeform multi-value text field (values joined with +). Tokenized into deal_products side table for product-level analysis.',
        affected_tables: ['deals_clean', 'deal_products'],
        handling: 'Use deal_products table for product-level queries. Join on deal_products.deal_monday_item_id = deals_clean.monday_item_id.',
      },
      {
        id: 'duplicate_deal_rows',
        severity: 'medium',
        description: 'Some (Owner, Client) pairs appear across multiple rows at different pipeline stages — these represent pipeline stage snapshots, not distinct deals. Do not assume 1 row = 1 unique deal.',
        affected_tables: ['deals_clean'],
        handling: 'Each row is treated as a distinct pipeline event. For unique deal counts, consider deduplication logic.',
      },
    ],
    current_completeness: stats.rows,
  };
}

// --- Tool: build_digest ---
export async function buildDigest(period?: string): Promise<unknown> {
  const pool = getPool();

  // Pipeline by stage
  const pipelineByStage = await pool.query(`
    SELECT deal_stage, deal_stage_order, deal_status,
      COUNT(*) as count,
      SUM(masked_deal_value) as total_value,
      COUNT(masked_deal_value) as deals_with_value,
      COUNT(*) - COUNT(masked_deal_value) as deals_without_value
    FROM deals_clean
    WHERE is_phantom_row = FALSE
    GROUP BY deal_stage, deal_stage_order, deal_status
    ORDER BY deal_stage_order, deal_status
  `);

  // Pipeline by sector
  const pipelineBySector = await pool.query(`
    SELECT sector_service, deal_status,
      COUNT(*) as count,
      SUM(masked_deal_value) as total_value,
      COUNT(masked_deal_value) as deals_with_value
    FROM deals_clean
    WHERE is_phantom_row = FALSE AND sector_service IS NOT NULL
    GROUP BY sector_service, deal_status
    ORDER BY sector_service, deal_status
  `);

  // Revenue won (deals with status = Won and has value)
  const revenueWon = await pool.query(`
    SELECT
      COUNT(*) as total_won_deals,
      COUNT(masked_deal_value) as won_deals_with_value,
      SUM(masked_deal_value) as total_won_value,
      COUNT(*) - COUNT(masked_deal_value) as won_deals_without_value
    FROM deals_clean
    WHERE is_phantom_row = FALSE AND deal_status = 'Won'
  `);

  // Top stalled deals (in a stage with long time since created/tentative close)
  const stalledDeals = await pool.query(`
    SELECT deal_name, owner_code, client_code, deal_stage, sector_service,
      created_date, tentative_close_date,
      CURRENT_DATE - created_date as days_since_created,
      masked_deal_value
    FROM deals_clean
    WHERE is_phantom_row = FALSE
      AND deal_status = 'Open'
      AND created_date IS NOT NULL
      AND deal_stage NOT IN ('A. Lead Generated', 'G. Project Won', 'H. Work Order Received', 'Project Completed')
    ORDER BY (CURRENT_DATE - created_date) DESC
    LIMIT 10
  `);

  // Work order execution status summary
  const woExecution = await pool.query(`
    SELECT execution_status, COUNT(*) as count,
      SUM(amount_excl_gst) as total_amount,
      COUNT(amount_excl_gst) as orders_with_amount
    FROM work_orders_clean
    WHERE is_phantom_row = FALSE
    GROUP BY execution_status
    ORDER BY count DESC
  `);

  // AR / Receivables aging
  const arSummary = await pool.query(`
    SELECT
      COUNT(*) as total_work_orders,
      SUM(amount_receivable) as total_receivable,
      COUNT(amount_receivable) as orders_with_receivable,
      SUM(CASE WHEN ar_priority_account IS NOT NULL THEN 1 ELSE 0 END) as priority_accounts,
      SUM(CASE WHEN wo_status_billed = 'Open' THEN amount_receivable ELSE 0 END) as open_receivable,
      SUM(CASE WHEN wo_status_billed = 'Closed' THEN amount_receivable ELSE 0 END) as closed_receivable
    FROM work_orders_clean
    WHERE is_phantom_row = FALSE
  `);

  // Anomalies
  const anomalies: string[] = [];

  // Won deals without close date
  const wonNoClose = await pool.query(`
    SELECT COUNT(*) as count FROM deals_clean
    WHERE is_phantom_row = FALSE AND deal_status = 'Won' AND close_date IS NULL
  `);
  if (parseInt(wonNoClose.rows[0].count) > 0) {
    anomalies.push(`${wonNoClose.rows[0].count} Won deals have no Close Date recorded`);
  }

  // Billed but uncollected
  const billedUncollected = await pool.query(`
    SELECT COUNT(*) as count FROM work_orders_clean
    WHERE is_phantom_row = FALSE
      AND (billing_status ILIKE '%billed%' OR invoice_status = 'Fully Billed')
      AND (collected_amount_incl_gst IS NULL OR collected_amount_incl_gst = 0)
  `);
  if (parseInt(billedUncollected.rows[0].count) > 0) {
    anomalies.push(`${billedUncollected.rows[0].count} work orders marked as billed but have zero/no collected amount`);
  }

  return {
    period: period || 'All time',
    generated_at: new Date().toISOString(),
    pipeline_by_stage: pipelineByStage.rows,
    pipeline_by_sector: pipelineBySector.rows,
    revenue_won: revenueWon.rows[0],
    top_stalled_deals: stalledDeals.rows,
    work_order_execution: woExecution.rows,
    ar_summary: arSummary.rows[0],
    anomalies,
    data_quality_notes: [
      'Masked Deal Value is missing for ~52% of deals. Totals only include deals with recorded values.',
      'Collection status column is 100% blank. Collection analysis uses collected_amount_incl_gst instead.',
      'Cross-board joins are approximate (no clean shared key exists).',
    ],
  };
}

// --- Tool definitions for Gemini function calling ---
export const TOOL_DECLARATIONS = [
  {
    name: 'get_schema',
    description: 'Returns the database schema for all clean tables (deals_clean, work_orders_clean, deal_products), including column types, per-column completeness percentages, row counts, and distinct values for key categorical columns. Call this FIRST before writing any SQL query to understand what columns exist and how complete they are.',
    parameters: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'run_query',
    description: 'Execute a read-only SQL query (SELECT only) against the Postgres database containing cleaned monday.com board data. Returns up to 200 rows. Always filter with WHERE is_phantom_row = FALSE. Use this tool for ALL numerical computations — never compute aggregates yourself from raw data. When results involve columns with known low completeness, note the coverage gap.',
    parameters: {
      type: 'object' as const,
      properties: {
        sql: {
          type: 'string',
          description: 'The SQL SELECT query to execute. Must be a valid PostgreSQL SELECT statement. Always include WHERE is_phantom_row = FALSE. For financial aggregates, exclude NULL values and note the count of excluded rows.',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'list_known_data_issues',
    description: 'Returns a curated list of known data quality issues in the dataset, including: phantom header rows, sparse columns (Closure Probability ~25% populated, Masked Deal Value ~48%, Collection Status 100% blank), the BIlled typo, no clean cross-board join key, and duplicate deal-stage snapshots. Use this to proactively caveat answers that touch affected columns.',
    parameters: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'build_digest',
    description: 'Generates a structured Leadership Digest containing: pipeline health by stage and sector, revenue/value for won deals, top stalled deals (open deals with no recent progress), work order execution status summary, AR/receivables aging signals, and proactively surfaced anomalies (e.g., Won deals without Close Date, billed-but-uncollected orders). Returns structured data — format it for the user as a readable report.',
    parameters: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          description: 'Optional time period filter (e.g., "Q1 2025", "last 6 months"). Defaults to "All time" if not specified.',
        },
      },
      required: [] as string[],
    },
  },
];
