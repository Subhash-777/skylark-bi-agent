/**
 * ONE-TIME SETUP SCRIPT: Creates monday.com boards and imports CSV data.
 * 
 * This script:
 * 1. Creates "Deals Pipeline" board with columns mapped from Deals CSV
 * 2. Creates "Work Order Tracker" board with columns mapped from Work Orders CSV
 * 3. Imports all rows from both CSVs into the respective boards (as-is, no pre-cleaning)
 * 4. Prints board IDs for .env configuration
 * 
 * Run: npx tsx scripts/setup-boards.ts
 * 
 * After running, update .env with the printed board IDs.
 * This script is the ONLY writer to monday.com — the deployed app is read-only.
 */

import * as fs from 'fs';
import * as path from 'path';

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN || '';
const API_URL = 'https://api.monday.com/v2';

// --- Monday.com GraphQL helpers ---

async function mondayQuery(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const body: Record<string, unknown> = { query };
  if (variables) body.variables = JSON.stringify(variables);

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': MONDAY_API_TOKEN,
      'API-Version': '2024-10',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday.com API error ${res.status}: ${text}`);
  }

  const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors && (json.errors as Array<{ message: string }>).length > 0) {
    throw new Error(`Monday.com GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// --- CSV parsing (manual, no dependency beyond Node) ---

function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split('\n');
  const result: string[][] = [];

  for (const line of lines) {
    if (line.trim() === '') continue;
    const row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else if (ch === '\r') {
        // skip carriage return
      } else {
        current += ch;
      }
    }
    row.push(current.trim());
    result.push(row);
  }

  return { headers: result[0] || [], rows: result.slice(1) };
}

// --- Board creation ---

async function createBoard(boardName: string, kind: string = 'public'): Promise<string> {
  const query = `mutation { create_board(board_name: "${boardName}", board_kind: ${kind}) { id } }`;
  const data = await mondayQuery(query) as { create_board: { id: string } };
  return data.create_board.id;
}

async function createColumn(boardId: string, title: string, columnType: string, defaults?: Record<string, unknown>): Promise<string> {
  let defaultsStr = '';
  if (defaults) {
    defaultsStr = `, defaults: ${JSON.stringify(JSON.stringify(defaults))}`;
  }
  const query = `mutation { create_column(board_id: ${boardId}, title: "${title}", column_type: ${columnType}${defaultsStr}) { id } }`;
  const data = await mondayQuery(query) as { create_column: { id: string } };
  return data.create_column.id;
}

// --- Rate limiting helper ---

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries && (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('complexity') || errMsg.includes('Rate'))) {
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 30000);
        console.log(`  Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
        await delay(waitMs);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// --- Main setup ---

async function setupDealsBoard(): Promise<string> {
  console.log('\n=== Creating Deals Pipeline Board ===');
  const boardId = await retryWithBackoff(() => createBoard('Deals Pipeline'));
  console.log(`Board created with ID: ${boardId}`);

  // Create columns (Deal Name is the item name, doesn't need a column)
  const columns: Array<{ title: string; type: string; defaults?: Record<string, unknown> }> = [
    { title: 'Owner code', type: 'text' },
    { title: 'Client Code', type: 'text' },
    {
      title: 'Deal Status', type: 'status',
      defaults: { labels: { '0': 'Open', '1': 'Won', '2': 'Dead', '3': 'On Hold' } }
    },
    { title: 'Close Date (A)', type: 'date' },
    {
      title: 'Closure Probability', type: 'status',
      defaults: { labels: { '0': 'High', '1': 'Medium', '2': 'Low' } }
    },
    { title: 'Masked Deal value', type: 'numbers' },
    { title: 'Tentative Close Date', type: 'date' },
    {
      title: 'Deal Stage', type: 'status',
      defaults: {
        labels: {
          '0': 'A. Lead Generated',
          '1': 'B. Sales Qualified Leads',
          '2': 'C. Demo Done',
          '3': 'D. Feasibility',
          '4': 'E. Proposal/Commercials Sent',
          '5': 'F. Negotiations',
          '6': 'G. Project Won',
          '7': 'H. Work Order Received',
          '8': 'I. POC',
          '9': 'J. Invoice sent',
          '10': 'K. Amount Accrued',
          '11': 'L. Project Lost',
          '12': 'M. Projects On Hold',
          '13': 'N. Not relevant at the moment',
          '14': 'O. Not Relevant at all',
          '15': 'Project Completed'
        }
      }
    },
    { title: 'Product deal', type: 'text' },
    {
      title: 'Sector/service', type: 'status',
      defaults: {
        labels: {
          '0': 'Mining', '1': 'Renewables', '2': 'Powerline', '3': 'Railways',
          '4': 'Construction', '5': 'Others', '6': 'DSP', '7': 'Tender',
          '8': 'Security and Surveillance', '9': 'Manufacturing', '10': 'Aviation'
        }
      }
    },
    { title: 'Created Date', type: 'date' },
  ];

  const columnIds: Record<string, string> = {};
  for (const col of columns) {
    await delay(500); // Respect rate limits
    const colId = await retryWithBackoff(() => createColumn(boardId, col.title, col.type, col.defaults));
    columnIds[col.title] = colId;
    console.log(`  Column "${col.title}" created: ${colId}`);
  }

  return boardId;
}

async function setupWorkOrdersBoard(): Promise<string> {
  console.log('\n=== Creating Work Order Tracker Board ===');
  const boardId = await retryWithBackoff(() => createBoard('Work Order Tracker'));
  console.log(`Board created with ID: ${boardId}`);

  // Work Orders columns (Deal name masked is the item name)
  const columns: Array<{ title: string; type: string; defaults?: Record<string, unknown> }> = [
    { title: 'Customer Name Code', type: 'text' },
    { title: 'Serial #', type: 'text' },
    { title: 'Nature of Work', type: 'text' },
    { title: 'Last executed month of recurring project', type: 'text' },
    {
      title: 'Execution Status', type: 'status',
      defaults: {
        labels: {
          '0': 'Completed', '1': 'Ongoing', '2': 'Not Started',
          '3': 'Executed until current month', '4': 'Pause / struck',
          '5': 'Partial Completed', '6': 'Details pending from Client'
        }
      }
    },
    { title: 'Data Delivery Date', type: 'date' },
    { title: 'Date of PO/LOI', type: 'date' },
    { title: 'Document Type', type: 'text' },
    { title: 'Probable Start Date', type: 'date' },
    { title: 'Probable End Date', type: 'date' },
    { title: 'BD/KAM Personnel code', type: 'text' },
    {
      title: 'Sector', type: 'status',
      defaults: {
        labels: {
          '0': 'Mining', '1': 'Renewables', '2': 'Powerline', '3': 'Railways',
          '4': 'Construction', '5': 'Others'
        }
      }
    },
    { title: 'Type of Work', type: 'text' },
    { title: 'Is any Skylark software platform part of the client deliverables in this deal?', type: 'text' },
    { title: 'Last invoice date', type: 'date' },
    { title: 'latest invoice no.', type: 'text' },
    { title: 'Amount in Rupees (Excl of GST) (Masked)', type: 'numbers' },
    { title: 'Amount in Rupees (Incl of GST) (Masked)', type: 'numbers' },
    { title: 'Billed Value in Rupees (Excl of GST.) (Masked)', type: 'numbers' },
    { title: 'Billed Value in Rupees (Incl of GST.) (Masked)', type: 'numbers' },
    { title: 'Collected Amount in Rupees (Incl of GST.) (Masked)', type: 'numbers' },
    { title: 'Amount to be billed in Rs. (Exl. of GST) (Masked)', type: 'numbers' },
    { title: 'Amount to be billed in Rs. (Incl. of GST) (Masked)', type: 'numbers' },
    { title: 'Amount Receivable (Masked)', type: 'numbers' },
    { title: 'AR Priority account', type: 'text' },
    { title: 'Quantity by Ops', type: 'text' },
    { title: 'Quantities as per PO', type: 'text' },
    { title: 'Quantity billed (till date)', type: 'text' },
    { title: 'Balance in quantity', type: 'text' },
    {
      title: 'Invoice Status', type: 'status',
      defaults: {
        labels: {
          '0': 'Fully Billed', '1': 'Partially Billed', '2': 'Not billed yet',
          '3': 'Billed- Visit 7', '4': 'Billed- Visit 3'
        }
      }
    },
    { title: 'Expected Billing Month', type: 'text' },
    { title: 'Actual Billing Month', type: 'text' },
    { title: 'Actual Collection Month', type: 'text' },
    {
      title: 'WO Status (billed)', type: 'status',
      defaults: { labels: { '0': 'Open', '1': 'Closed' } }
    },
    { title: 'Collection status', type: 'text' },
    { title: 'Collection Date', type: 'text' },
    {
      title: 'Billing Status', type: 'text' // Keeping as text due to freeform values including typos
    },
  ];

  const columnIds: Record<string, string> = {};
  for (const col of columns) {
    await delay(500);
    const colId = await retryWithBackoff(() => createColumn(boardId, col.title, col.type, col.defaults));
    columnIds[col.title] = colId;
    console.log(`  Column "${col.title}" created: ${colId}`);
  }

  return boardId;
}

async function getColumnMapping(boardId: string): Promise<Record<string, string>> {
  const query = `query { boards(ids: ${boardId}) { columns { id title } } }`;
  const data = await mondayQuery(query) as { boards: Array<{ columns: Array<{ id: string; title: string }> }> };
  const mapping: Record<string, string> = {};
  for (const col of data.boards[0].columns) {
    mapping[col.title] = col.id;
  }
  return mapping;
}

function formatDateForMonday(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;
  // Expected format: YYYY-MM-DD
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return null;
}

function formatNumberForMonday(numStr: string): number | null {
  if (!numStr || numStr.trim() === '' || numStr === '#VALUE!') return null;
  const cleaned = numStr.replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function importDealsRows(boardId: string, csvPath: string): Promise<void> {
  console.log('\n=== Importing Deals Data ===');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const { headers, rows } = parseCSV(content);
  console.log(`Found ${rows.length} data rows with headers: ${headers.join(', ')}`);

  const colMap = await getColumnMapping(boardId);
  console.log('Column mapping:', JSON.stringify(colMap, null, 2));

  let imported = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue; // Skip empty rows

    const itemName = row[0] || `Deal_Row_${i + 1}`;

    // Build column values
    const columnValues: Record<string, unknown> = {};

    // Owner code (text)
    if (row[1] && colMap['Owner code']) {
      columnValues[colMap['Owner code']] = row[1];
    }
    // Client Code (text)
    if (row[2] && colMap['Client Code']) {
      columnValues[colMap['Client Code']] = row[2];
    }
    // Deal Status (status)
    if (row[3] && colMap['Deal Status']) {
      columnValues[colMap['Deal Status']] = { label: row[3] };
    }
    // Close Date (A) (date)
    const closeDate = formatDateForMonday(row[4]);
    if (closeDate && colMap['Close Date (A)']) {
      columnValues[colMap['Close Date (A)']] = { date: closeDate };
    }
    // Closure Probability (status)
    if (row[5] && colMap['Closure Probability']) {
      columnValues[colMap['Closure Probability']] = { label: row[5] };
    }
    // Masked Deal value (numbers)
    const dealValue = formatNumberForMonday(row[6]);
    if (dealValue !== null && colMap['Masked Deal value']) {
      columnValues[colMap['Masked Deal value']] = dealValue.toString();
    }
    // Tentative Close Date (date)
    const tentDate = formatDateForMonday(row[7]);
    if (tentDate && colMap['Tentative Close Date']) {
      columnValues[colMap['Tentative Close Date']] = { date: tentDate };
    }
    // Deal Stage (status)
    if (row[8] && colMap['Deal Stage']) {
      columnValues[colMap['Deal Stage']] = { label: row[8] };
    }
    // Product deal (text)
    if (row[9] && colMap['Product deal']) {
      columnValues[colMap['Product deal']] = row[9];
    }
    // Sector/service (status)
    if (row[10] && colMap['Sector/service']) {
      columnValues[colMap['Sector/service']] = { label: row[10] };
    }
    // Created Date (date)
    const createdDate = formatDateForMonday(row[11]);
    if (createdDate && colMap['Created Date']) {
      columnValues[colMap['Created Date']] = { date: createdDate };
    }

    const colValuesStr = JSON.stringify(JSON.stringify(columnValues));
    const escapedName = itemName.replace(/"/g, '\\"').replace(/\\/g, '\\\\');

    try {
      await retryWithBackoff(async () => {
        const query = `mutation { create_item(board_id: ${boardId}, item_name: "${escapedName}", column_values: ${colValuesStr}) { id } }`;
        return await mondayQuery(query);
      });
      imported++;
      if (imported % 25 === 0) {
        console.log(`  Imported ${imported}/${rows.length} deals...`);
      }
      await delay(300); // Rate limit
    } catch (err) {
      console.error(`  Error importing deal row ${i + 1} ("${itemName}"): ${err}`);
    }
  }
  console.log(`\nDone! Imported ${imported}/${rows.length} deals.`);
}

async function importWorkOrdersRows(boardId: string, csvPath: string): Promise<void> {
  console.log('\n=== Importing Work Orders Data ===');
  const rawContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = rawContent.split('\n');

  // Row 1 is blank (commas only), row 2 is the header — skip row 1
  const contentWithoutBlankRow = lines.slice(1).join('\n');
  const { headers, rows } = parseCSV(contentWithoutBlankRow);
  console.log(`Found ${rows.length} data rows`);
  console.log(`Headers (${headers.length}): ${headers.slice(0, 5).join(', ')}...`);

  const colMap = await getColumnMapping(boardId);

  let imported = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;

    const itemName = row[0] || `WO_Row_${i + 1}`;
    const columnValues: Record<string, unknown> = {};

    // Map each field by header index
    const fieldMappings: Array<{ headerIdx: number; colTitle: string; type: 'text' | 'date' | 'number' | 'status' }> = [
      { headerIdx: 1, colTitle: 'Customer Name Code', type: 'text' },
      { headerIdx: 2, colTitle: 'Serial #', type: 'text' },
      { headerIdx: 3, colTitle: 'Nature of Work', type: 'text' },
      { headerIdx: 4, colTitle: 'Last executed month of recurring project', type: 'text' },
      { headerIdx: 5, colTitle: 'Execution Status', type: 'status' },
      { headerIdx: 6, colTitle: 'Data Delivery Date', type: 'date' },
      { headerIdx: 7, colTitle: 'Date of PO/LOI', type: 'date' },
      { headerIdx: 8, colTitle: 'Document Type', type: 'text' },
      { headerIdx: 9, colTitle: 'Probable Start Date', type: 'date' },
      { headerIdx: 10, colTitle: 'Probable End Date', type: 'date' },
      { headerIdx: 11, colTitle: 'BD/KAM Personnel code', type: 'text' },
      { headerIdx: 12, colTitle: 'Sector', type: 'status' },
      { headerIdx: 13, colTitle: 'Type of Work', type: 'text' },
      { headerIdx: 14, colTitle: 'Is any Skylark software platform part of the client deliverables in this deal?', type: 'text' },
      { headerIdx: 15, colTitle: 'Last invoice date', type: 'date' },
      { headerIdx: 16, colTitle: 'latest invoice no.', type: 'text' },
      { headerIdx: 17, colTitle: 'Amount in Rupees (Excl of GST) (Masked)', type: 'number' },
      { headerIdx: 18, colTitle: 'Amount in Rupees (Incl of GST) (Masked)', type: 'number' },
      { headerIdx: 19, colTitle: 'Billed Value in Rupees (Excl of GST.) (Masked)', type: 'number' },
      { headerIdx: 20, colTitle: 'Billed Value in Rupees (Incl of GST.) (Masked)', type: 'number' },
      { headerIdx: 21, colTitle: 'Collected Amount in Rupees (Incl of GST.) (Masked)', type: 'number' },
      { headerIdx: 22, colTitle: 'Amount to be billed in Rs. (Exl. of GST) (Masked)', type: 'number' },
      { headerIdx: 23, colTitle: 'Amount to be billed in Rs. (Incl. of GST) (Masked)', type: 'number' },
      { headerIdx: 24, colTitle: 'Amount Receivable (Masked)', type: 'number' },
      { headerIdx: 25, colTitle: 'AR Priority account', type: 'text' },
      { headerIdx: 26, colTitle: 'Quantity by Ops', type: 'text' },
      { headerIdx: 27, colTitle: 'Quantities as per PO', type: 'text' },
      { headerIdx: 28, colTitle: 'Quantity billed (till date)', type: 'text' },
      { headerIdx: 29, colTitle: 'Balance in quantity', type: 'text' },
      { headerIdx: 30, colTitle: 'Invoice Status', type: 'status' },
      { headerIdx: 31, colTitle: 'Expected Billing Month', type: 'text' },
      { headerIdx: 32, colTitle: 'Actual Billing Month', type: 'text' },
      { headerIdx: 33, colTitle: 'Actual Collection Month', type: 'text' },
      { headerIdx: 34, colTitle: 'WO Status (billed)', type: 'status' },
      { headerIdx: 35, colTitle: 'Collection status', type: 'text' },
      { headerIdx: 36, colTitle: 'Collection Date', type: 'text' },
      { headerIdx: 37, colTitle: 'Billing Status', type: 'text' },
    ];

    for (const field of fieldMappings) {
      const value = row[field.headerIdx];
      const colId = colMap[field.colTitle];
      if (!value || !colId || value.trim() === '') continue;

      switch (field.type) {
        case 'text':
          columnValues[colId] = value;
          break;
        case 'date': {
          const d = formatDateForMonday(value);
          if (d) columnValues[colId] = { date: d };
          break;
        }
        case 'number': {
          const n = formatNumberForMonday(value);
          if (n !== null) columnValues[colId] = n.toString();
          break;
        }
        case 'status':
          columnValues[colId] = { label: value };
          break;
      }
    }

    const colValuesStr = JSON.stringify(JSON.stringify(columnValues));
    const escapedName = itemName.replace(/"/g, '\\"').replace(/\\/g, '\\\\');

    try {
      await retryWithBackoff(async () => {
        const query = `mutation { create_item(board_id: ${boardId}, item_name: "${escapedName}", column_values: ${colValuesStr}) { id } }`;
        return await mondayQuery(query);
      });
      imported++;
      if (imported % 25 === 0) {
        console.log(`  Imported ${imported}/${rows.length} work orders...`);
      }
      await delay(300);
    } catch (err) {
      console.error(`  Error importing WO row ${i + 1} ("${itemName}"): ${err}`);
    }
  }
  console.log(`\nDone! Imported ${imported}/${rows.length} work orders.`);
}

// --- Main ---

async function main() {
  if (!MONDAY_API_TOKEN) {
    console.error('Error: MONDAY_API_TOKEN not set. Run with: MONDAY_API_TOKEN=xxx npx tsx scripts/setup-boards.ts');
    process.exit(1);
  }

  console.log('Starting monday.com board setup...');
  console.log('API Token (first 20 chars):', MONDAY_API_TOKEN.substring(0, 20) + '...');

  // Verify API connection
  try {
    const data = await mondayQuery('query { me { name } }') as { me: { name: string } };
    console.log(`Authenticated as: ${data.me.name}`);
  } catch (err) {
    console.error('Failed to authenticate with monday.com:', err);
    process.exit(1);
  }

  // CSV paths
  const dealsCSV = path.join(__dirname, '..', 'Deal funnel Data.xlsx - Deal tracker.csv');
  const workOrdersCSV = path.join(__dirname, '..', 'Work_Order_Tracker Data.xlsx - work order tracker.csv');

  if (!fs.existsSync(dealsCSV)) {
    console.error(`Deals CSV not found at: ${dealsCSV}`);
    process.exit(1);
  }
  if (!fs.existsSync(workOrdersCSV)) {
    console.error(`Work Orders CSV not found at: ${workOrdersCSV}`);
    process.exit(1);
  }

  // Step 1: Create boards
  const dealsBoardId = await setupDealsBoard();
  await delay(2000);
  const workOrdersBoardId = await setupWorkOrdersBoard();

  console.log('\n=== Boards Created ===');
  console.log(`Deals Board ID: ${dealsBoardId}`);
  console.log(`Work Orders Board ID: ${workOrdersBoardId}`);

  // Step 2: Import data
  await delay(3000);
  await importDealsRows(dealsBoardId, dealsCSV);
  await delay(3000);
  await importWorkOrdersRows(workOrdersBoardId, workOrdersCSV);

  // Step 3: Print env vars
  console.log('\n====================================');
  console.log('Add these to your .env file:');
  console.log(`MONDAY_DEALS_BOARD_ID=${dealsBoardId}`);
  console.log(`MONDAY_WORK_ORDERS_BOARD_ID=${workOrdersBoardId}`);
  console.log('====================================');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
