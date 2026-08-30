/**
 * Monday.com GraphQL API client.
 * Read-only access for syncing board data.
 */

const API_URL = 'https://api.monday.com/v2';

interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

interface MondayColumnValue {
  id: string;
  text: string;
  value: string | null;
}

interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

interface MondayBoard {
  id: string;
  name: string;
  columns: MondayColumn[];
  items_page: {
    cursor: string | null;
    items: MondayItem[];
  };
}

export async function mondayGraphQL(query: string, maxRetries = 5): Promise<unknown> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN not set');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
          'API-Version': '2024-10',
        },
        body: JSON.stringify({ query }),
      });

      if (res.status === 429 || res.status === 503) {
        if (attempt < maxRetries) {
          const waitMs = Math.min(2000 * Math.pow(2, attempt), 15000);
          console.log(`[Monday.com API] Rate limited (${res.status}), waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Monday.com API error ${res.status}: ${text.substring(0, 300)}`);
      }

      const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> };
      if (json.errors && json.errors.length > 0) {
        throw new Error(`Monday.com GraphQL errors: ${JSON.stringify(json.errors)}`);
      }
      return json.data;
    } catch (err) {
      if (attempt < maxRetries && String(err).includes('429')) {
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 15000);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded for monday.com GraphQL API');
}

/**
 * Fetch all items from a board with pagination.
 */
export async function fetchBoardItems(boardId: string): Promise<{
  columns: MondayColumn[];
  items: MondayItem[];
}> {
  const allItems: MondayItem[] = [];
  let columns: MondayColumn[] = [];
  let cursor: string | null = null;
  let isFirstPage = true;

  while (true) {
    let query: string;
    if (isFirstPage) {
      query = `query {
        boards(ids: ${boardId}) {
          id
          name
          columns { id title type }
          items_page(limit: 500) {
            cursor
            items {
              id
              name
              column_values { id text value }
            }
          }
        }
      }`;
    } else {
      query = `query {
        next_items_page(limit: 500, cursor: "${cursor}") {
          cursor
          items {
            id
            name
            column_values { id text value }
          }
        }
      }`;
    }

    const data = await mondayGraphQL(query);

    if (isFirstPage) {
      const board = (data as { boards: MondayBoard[] }).boards[0];
      columns = board.columns;
      allItems.push(...board.items_page.items);
      cursor = board.items_page.cursor;
      isFirstPage = false;
    } else {
      const page = (data as { next_items_page: { cursor: string | null; items: MondayItem[] } }).next_items_page;
      allItems.push(...page.items);
      cursor = page.cursor;
    }

    if (!cursor) break;
  }

  return { columns, items: allItems };
}

/**
 * Build a column title → column id mapping from column definitions.
 */
export function buildColumnMap(columns: MondayColumn[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const col of columns) {
    map[col.title] = col.id;
  }
  return map;
}

/**
 * Get a column value's text from an item, by column title.
 */
export function getColumnText(
  item: MondayItem,
  columnMap: Record<string, string>,
  columnTitle: string
): string {
  const colId = columnMap[columnTitle];
  if (!colId) return '';
  const cv = item.column_values.find(c => c.id === colId);
  return cv?.text || '';
}
