/**
 * Database connection and schema management for Supabase Postgres.
 * Uses pg directly (not Supabase client) for SQL control.
 */
import { Pool } from 'pg';

// Connection pool - reuse across serverless invocations
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // Required for Supabase pooler
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

/**
 * Execute a read-only SQL query. Rejects anything that isn't a SELECT.
 */
export async function executeReadOnlyQuery(sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    throw new Error('Only SELECT queries are allowed. This is a read-only interface.');
  }
  
  // Additional safety checks
  const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE'];
  for (const keyword of forbidden) {
    // Check if the keyword appears as a statement start (not inside a string or subquery name)
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(sql) && keyword !== 'CREATE') {
      // Allow CREATE only if it's inside a CTE name like "created_deals"
      const beforeKeyword = sql.substring(0, sql.toUpperCase().indexOf(keyword));
      if (!beforeKeyword.includes("'") || beforeKeyword.split("'").length % 2 === 1) {
        // Not inside a string literal - additional validation needed
        if (keyword !== 'CREATE' || !trimmed.startsWith('WITH')) {
          // Be more careful - only block if it looks like a DML statement
          const pattern = new RegExp(`(?:^|;)\\s*${keyword}\\b`, 'i');
          if (pattern.test(sql)) {
            throw new Error(`Query contains forbidden keyword: ${keyword}. Only SELECT queries are allowed.`);
          }
        }
      }
    }
  }

  const pool = getPool();
  const result = await pool.query(sql);
  return {
    rows: result.rows,
    rowCount: result.rowCount || 0,
  };
}

/**
 * Initialize the database schema - creates tables if they don't exist.
 */
export async function initializeSchema(): Promise<void> {
  const pool = getPool();
  
  await pool.query(`
    -- Deals clean table
    CREATE TABLE IF NOT EXISTS deals_clean (
      id SERIAL PRIMARY KEY,
      monday_item_id TEXT UNIQUE,
      deal_name TEXT,
      owner_code TEXT,
      client_code TEXT,
      deal_status TEXT,
      close_date DATE,
      closure_probability TEXT,
      masked_deal_value NUMERIC,
      tentative_close_date DATE,
      deal_stage TEXT,
      deal_stage_order INTEGER,
      product_deal TEXT,
      sector_service TEXT,
      created_date DATE,
      is_phantom_row BOOLEAN DEFAULT FALSE,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Work orders clean table
    CREATE TABLE IF NOT EXISTS work_orders_clean (
      id SERIAL PRIMARY KEY,
      monday_item_id TEXT UNIQUE,
      deal_name_masked TEXT,
      customer_name_code TEXT,
      serial_number TEXT,
      nature_of_work TEXT,
      last_executed_month TEXT,
      execution_status TEXT,
      data_delivery_date DATE,
      date_of_po_loi DATE,
      document_type TEXT,
      probable_start_date DATE,
      probable_end_date DATE,
      bd_kam_personnel_code TEXT,
      sector TEXT,
      type_of_work TEXT,
      skylark_software_platform TEXT,
      last_invoice_date DATE,
      latest_invoice_no TEXT,
      amount_excl_gst NUMERIC,
      amount_incl_gst NUMERIC,
      billed_value_excl_gst NUMERIC,
      billed_value_incl_gst NUMERIC,
      collected_amount_incl_gst NUMERIC,
      amount_to_be_billed_excl_gst NUMERIC,
      amount_to_be_billed_incl_gst NUMERIC,
      amount_receivable NUMERIC,
      ar_priority_account TEXT,
      quantity_by_ops TEXT,
      quantities_as_per_po TEXT,
      quantity_billed TEXT,
      balance_in_quantity TEXT,
      invoice_status TEXT,
      expected_billing_month TEXT,
      actual_billing_month TEXT,
      actual_collection_month TEXT,
      wo_status_billed TEXT,
      collection_status TEXT,
      collection_date TEXT,
      billing_status TEXT,
      is_phantom_row BOOLEAN DEFAULT FALSE,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Product deal tokenized side table
    CREATE TABLE IF NOT EXISTS deal_products (
      id SERIAL PRIMARY KEY,
      deal_monday_item_id TEXT REFERENCES deals_clean(monday_item_id) ON DELETE CASCADE,
      product TEXT NOT NULL
    );

    -- Sync log for data quality tracking
    CREATE TABLE IF NOT EXISTS sync_log (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      populated_rows INTEGER NOT NULL,
      pct_populated NUMERIC(5,2) NOT NULL,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_deals_sector ON deals_clean(sector_service);
    CREATE INDEX IF NOT EXISTS idx_deals_status ON deals_clean(deal_status);
    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals_clean(deal_stage);
    CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals_clean(owner_code);
    CREATE INDEX IF NOT EXISTS idx_wo_sector ON work_orders_clean(sector);
    CREATE INDEX IF NOT EXISTS idx_wo_execution ON work_orders_clean(execution_status);
    CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders_clean(wo_status_billed);
    CREATE INDEX IF NOT EXISTS idx_deal_products_deal ON deal_products(deal_monday_item_id);
  `);
}
