/**
 * Data cleaning pipeline — implements PLAN.md §5.
 * 
 * This is a deterministic pipeline, NOT an LLM call. It handles:
 * 1. Phantom header-rows-as-data detection and removal
 * 2. Categorical normalization (BIlled → Billed, etc.)
 * 3. Type coercion (dates, numbers, nulls)
 * 4. Product deal tokenization (split on +)
 * 5. Per-column completeness stats for sync_log
 */

import { getPool } from './db';
import { fetchBoardItems, buildColumnMap, getColumnText } from './monday';

// --- Known typo/synonym corrections ---
const BILLING_STATUS_CORRECTIONS: Record<string, string> = {
  'BIlled': 'Billed',
  'billed': 'Billed',
  'BILLED': 'Billed',
  'Partially billed': 'Partially Billed',
  'partially billed': 'Partially Billed',
  'Update required': 'Update Required',
  'update required': 'Update Required',
  'Not billable': 'Not Billable',
  'not billable': 'Not Billable',
  'Stuck': 'Stuck',
  'stuck': 'Stuck',
};

// Deal stage ordering for funnel analysis
const DEAL_STAGE_ORDER: Record<string, number> = {
  'A. Lead Generated': 1,
  'B. Sales Qualified Leads': 2,
  'C. Demo Done': 3,
  'D. Feasibility': 4,
  'E. Proposal/Commercials Sent': 5,
  'F. Negotiations': 6,
  'G. Project Won': 7,
  'H. Work Order Received': 8,
  'I. POC': 9,
  'J. Invoice sent': 10,
  'K. Amount Accrued': 11,
  'L. Project Lost': 12,
  'M. Projects On Hold': 13,
  'N. Not relevant at the moment': 14,
  'O. Not Relevant at all': 15,
  'Project Completed': 16,
};

// --- Helper functions ---

function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function parseNumber(numStr: string): number | null {
  if (!numStr || numStr.trim() === '' || numStr === '#VALUE!') return null;
  const cleaned = numStr.replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Check if a row is a phantom header row — where categorical values equal column headers.
 */
function isPhantomHeaderRow(values: Record<string, string>, headerNames: string[]): boolean {
  let matchCount = 0;
  for (const header of headerNames) {
    const value = values[header];
    if (value && value.trim() === header.trim()) {
      matchCount++;
    }
  }
  // If 3+ columns have their value = their header name, it's a phantom row
  return matchCount >= 3;
}

/**
 * Normalize a billing status value using the known corrections map.
 */
function normalizeBillingStatus(value: string): string {
  if (!value) return '';
  const corrected = BILLING_STATUS_CORRECTIONS[value];
  return corrected || value;
}

/**
 * Tokenize product deal field (split on " + ").
 * "Service + Spectra" → ["Service", "Spectra"]
 * "Dock + DMO + Spectra + Service" → ["Dock", "DMO", "Spectra", "Service"]
 */
function tokenizeProducts(productDeal: string): string[] {
  if (!productDeal || productDeal.trim() === '') return [];
  return productDeal
    .split('+')
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

// --- Main sync functions ---

export async function syncDeals(): Promise<{ imported: number; phantomRows: number; errors: string[] }> {
  const boardId = process.env.MONDAY_DEALS_BOARD_ID;
  if (!boardId) throw new Error('MONDAY_DEALS_BOARD_ID not set');

  const { columns, items } = await fetchBoardItems(boardId);
  const colMap = buildColumnMap(columns);
  const pool = getPool();

  const headerCheckColumns = ['Deal Status', 'Deal Stage', 'Sector/service', 'Closure Probability'];
  let imported = 0;
  let phantomRows = 0;
  const errors: string[] = [];

  // Clear existing data for clean re-sync (idempotent)
  await pool.query('DELETE FROM deal_products');
  await pool.query('DELETE FROM deals_clean');

  for (const item of items) {
    const values: Record<string, string> = {};
    for (const colTitle of Object.keys(colMap)) {
      values[colTitle] = getColumnText(item, colMap, colTitle);
    }

    const isPhantom = isPhantomHeaderRow(values, headerCheckColumns);
    if (isPhantom) {
      phantomRows++;
      continue; // Skip phantom header rows
    }

    const dealStage = values['Deal Stage'] || null;
    const stageOrder = dealStage ? (DEAL_STAGE_ORDER[dealStage] || null) : null;
    const billingStatus = values['Billing Status'] ? normalizeBillingStatus(values['Billing Status']) : null;

    try {
      await pool.query(
        `INSERT INTO deals_clean (
          monday_item_id, deal_name, owner_code, client_code, deal_status,
          close_date, closure_probability, masked_deal_value, tentative_close_date,
          deal_stage, deal_stage_order, product_deal, sector_service, created_date, is_phantom_row
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (monday_item_id) DO UPDATE SET
          deal_name = EXCLUDED.deal_name,
          owner_code = EXCLUDED.owner_code,
          client_code = EXCLUDED.client_code,
          deal_status = EXCLUDED.deal_status,
          close_date = EXCLUDED.close_date,
          closure_probability = EXCLUDED.closure_probability,
          masked_deal_value = EXCLUDED.masked_deal_value,
          tentative_close_date = EXCLUDED.tentative_close_date,
          deal_stage = EXCLUDED.deal_stage,
          deal_stage_order = EXCLUDED.deal_stage_order,
          product_deal = EXCLUDED.product_deal,
          sector_service = EXCLUDED.sector_service,
          created_date = EXCLUDED.created_date,
          is_phantom_row = EXCLUDED.is_phantom_row,
          synced_at = NOW()`,
        [
          item.id,
          item.name || null,
          values['Owner code'] || null,
          values['Client Code'] || null,
          values['Deal Status'] || null,
          parseDate(values['Close Date (A)'] || ''),
          values['Closure Probability'] || null,
          parseNumber(values['Masked Deal value'] || ''),
          parseDate(values['Tentative Close Date'] || ''),
          dealStage,
          stageOrder,
          values['Product deal'] || null,
          values['Sector/service'] || null,
          parseDate(values['Created Date'] || ''),
          false,
        ]
      );

      // Tokenize product deal into side table
      const products = tokenizeProducts(values['Product deal'] || '');
      for (const product of products) {
        await pool.query(
          'INSERT INTO deal_products (deal_monday_item_id, product) VALUES ($1, $2)',
          [item.id, product]
        );
      }

      imported++;
    } catch (err) {
      errors.push(`Deal "${item.name}" (${item.id}): ${err}`);
    }
  }

  return { imported, phantomRows, errors };
}

export async function syncWorkOrders(): Promise<{ imported: number; phantomRows: number; errors: string[] }> {
  const boardId = process.env.MONDAY_WORK_ORDERS_BOARD_ID;
  if (!boardId) throw new Error('MONDAY_WORK_ORDERS_BOARD_ID not set');

  const { columns, items } = await fetchBoardItems(boardId);
  const colMap = buildColumnMap(columns);
  const pool = getPool();

  let imported = 0;
  let phantomRows = 0;
  const errors: string[] = [];

  await pool.query('DELETE FROM work_orders_clean');

  for (const item of items) {
    const values: Record<string, string> = {};
    for (const colTitle of Object.keys(colMap)) {
      values[colTitle] = getColumnText(item, colMap, colTitle);
    }

    // Normalize billing status
    const billingStatus = normalizeBillingStatus(values['Billing Status'] || '');

    try {
      await pool.query(
        `INSERT INTO work_orders_clean (
          monday_item_id, deal_name_masked, customer_name_code, serial_number,
          nature_of_work, last_executed_month, execution_status, data_delivery_date,
          date_of_po_loi, document_type, probable_start_date, probable_end_date,
          bd_kam_personnel_code, sector, type_of_work, skylark_software_platform,
          last_invoice_date, latest_invoice_no, amount_excl_gst, amount_incl_gst,
          billed_value_excl_gst, billed_value_incl_gst, collected_amount_incl_gst,
          amount_to_be_billed_excl_gst, amount_to_be_billed_incl_gst, amount_receivable,
          ar_priority_account, quantity_by_ops, quantities_as_per_po, quantity_billed,
          balance_in_quantity, invoice_status, expected_billing_month, actual_billing_month,
          actual_collection_month, wo_status_billed, collection_status, collection_date,
          billing_status, is_phantom_row
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40
        )
        ON CONFLICT (monday_item_id) DO UPDATE SET
          deal_name_masked = EXCLUDED.deal_name_masked,
          customer_name_code = EXCLUDED.customer_name_code,
          execution_status = EXCLUDED.execution_status,
          billing_status = EXCLUDED.billing_status,
          wo_status_billed = EXCLUDED.wo_status_billed,
          synced_at = NOW()`,
        [
          item.id, item.name || null,
          values['Customer Name Code'] || null,
          values['Serial #'] || null,
          values['Nature of Work'] || null,
          values['Last executed month of recurring project'] || null,
          values['Execution Status'] || null,
          parseDate(values['Data Delivery Date'] || ''),
          parseDate(values['Date of PO/LOI'] || ''),
          values['Document Type'] || null,
          parseDate(values['Probable Start Date'] || ''),
          parseDate(values['Probable End Date'] || ''),
          values['BD/KAM Personnel code'] || null,
          values['Sector'] || null,
          values['Type of Work'] || null,
          values['Is any Skylark software platform part of the client deliverables in this deal?'] || null,
          parseDate(values['Last invoice date'] || ''),
          values['latest invoice no.'] || null,
          parseNumber(values['Amount in Rupees (Excl of GST) (Masked)'] || ''),
          parseNumber(values['Amount in Rupees (Incl of GST) (Masked)'] || ''),
          parseNumber(values['Billed Value in Rupees (Excl of GST.) (Masked)'] || ''),
          parseNumber(values['Billed Value in Rupees (Incl of GST.) (Masked)'] || ''),
          parseNumber(values['Collected Amount in Rupees (Incl of GST.) (Masked)'] || ''),
          parseNumber(values['Amount to be billed in Rs. (Exl. of GST) (Masked)'] || ''),
          parseNumber(values['Amount to be billed in Rs. (Incl. of GST) (Masked)'] || ''),
          parseNumber(values['Amount Receivable (Masked)'] || ''),
          values['AR Priority account'] || null,
          values['Quantity by Ops'] || null,
          values['Quantities as per PO'] || null,
          values['Quantity billed (till date)'] || null,
          values['Balance in quantity'] || null,
          values['Invoice Status'] || null,
          values['Expected Billing Month'] || null,
          values['Actual Billing Month'] || null,
          values['Actual Collection Month'] || null,
          values['WO Status (billed)'] || null,
          values['Collection status'] || null,
          values['Collection Date'] || null,
          billingStatus || null,
          false,
        ]
      );
      imported++;
    } catch (err) {
      errors.push(`WO "${item.name}" (${item.id}): ${err}`);
    }
  }

  return { imported, phantomRows, errors };
}

/**
 * Compute per-column completeness stats and store in sync_log.
 */
export async function computeCompletenessStats(): Promise<void> {
  const pool = getPool();

  // Clear old stats
  await pool.query('DELETE FROM sync_log');

  // Deals columns to track
  const dealsColumns = [
    'deal_name', 'owner_code', 'client_code', 'deal_status', 'close_date',
    'closure_probability', 'masked_deal_value', 'tentative_close_date',
    'deal_stage', 'product_deal', 'sector_service', 'created_date'
  ];

  for (const col of dealsColumns) {
    await pool.query(`
      INSERT INTO sync_log (table_name, column_name, total_rows, populated_rows, pct_populated)
      SELECT 'deals_clean', $1,
        COUNT(*),
        COUNT(${col}),
        ROUND(COUNT(${col})::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2)
      FROM deals_clean
      WHERE is_phantom_row = FALSE
    `, [col]);
  }

  // Work orders columns to track
  const woColumns = [
    'execution_status', 'collection_status', 'billing_status', 'wo_status_billed',
    'amount_excl_gst', 'amount_incl_gst', 'billed_value_excl_gst',
    'collected_amount_incl_gst', 'amount_receivable', 'ar_priority_account',
    'sector', 'bd_kam_personnel_code', 'invoice_status'
  ];

  for (const col of woColumns) {
    await pool.query(`
      INSERT INTO sync_log (table_name, column_name, total_rows, populated_rows, pct_populated)
      SELECT 'work_orders_clean', $1,
        COUNT(*),
        COUNT(${col}),
        ROUND(COUNT(${col})::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2)
      FROM work_orders_clean
      WHERE is_phantom_row = FALSE
    `, [col]);
  }
}

/**
 * Full sync: fetch from monday.com → clean → store in Postgres → compute stats.
 */
export async function fullSync(): Promise<{
  deals: { imported: number; phantomRows: number; errors: string[] };
  workOrders: { imported: number; phantomRows: number; errors: string[] };
  timestamp: string;
}> {
  const deals = await syncDeals();
  const workOrders = await syncWorkOrders();
  await computeCompletenessStats();

  return {
    deals,
    workOrders,
    timestamp: new Date().toISOString(),
  };
}
