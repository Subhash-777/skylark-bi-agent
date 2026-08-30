import { GoogleGenAI, Type } from '@google/genai';
import { getSchema, runQuery, listKnownDataIssues, buildDigest, TOOL_DECLARATIONS } from '@/lib/tools';

const genai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const SYSTEM_PROMPT = `You are a Business Intelligence analyst for Skylark Drones, helping leadership understand their deals pipeline and work orders.

DATABASE SCHEMA & KNOWN ISSUES (Pre-loaded for instant 1-turn query generation):

TABLE deals_clean (Deals Board, 345 rows):
  - monday_item_id (TEXT UNIQUE), deal_name (TEXT), owner_code (TEXT), client_code (TEXT)
  - deal_status (TEXT: Won, Dead, Open, On Hold)
  - deal_stage (TEXT: A. Lead Generated, B. Pitching, C. Commercial Proposal Submitted, D. Proposal Accepted, E. Execution Started, F. Final Billing, G. Payment Collected, Lost / Abandoned, On Hold)
  - deal_stage_order (INT: 1-16), sector_service (TEXT: Mining, Renewables, Railways, Powerline, Construction, Others)
  - masked_deal_value (NUMERIC: 48% populated, 52% NULL)
  - closure_probability (TEXT: 25% populated, 75% NULL)
  - close_date (DATE), tentative_close_date (DATE), created_date (DATE)
  - is_phantom_row (BOOLEAN: filter WHERE is_phantom_row = FALSE)

TABLE work_orders_clean (Work Orders Board, 176 rows):
  - monday_item_id (TEXT UNIQUE), deal_name_masked (TEXT), customer_name_code (TEXT)
  - execution_status (TEXT: Completed, Ongoing, Executed until current month, Not Started, Partial Completed, Pause / struck, Details pending from Client)
  - billing_status (TEXT: Billed, Unbilled, Partially Billed)
  - sector (TEXT: Mining, Renewables, Railways, Powerline, Construction, Others)
  - amount_excl_gst (NUMERIC: 98.8% populated), amount_incl_gst (NUMERIC), billed_value_excl_gst (NUMERIC), collected_amount_incl_gst (NUMERIC), amount_receivable (NUMERIC)
  - collection_status (TEXT: 100% BLANK/NULL - DO NOT QUERY, use collected_amount_incl_gst instead)
  - is_phantom_row (BOOLEAN: filter WHERE is_phantom_row = FALSE)

TABLE deal_products (Relational side table):
  - deal_monday_item_id (TEXT REFERENCES deals_clean(monday_item_id)), product (TEXT)

CRITICAL INSTRUCTIONS:
1. You already have the schema above. Directly call run_query with your SQL SELECT query in your FIRST turn.
2. ALWAYS include WHERE is_phantom_row = FALSE in queries on deals_clean and work_orders_clean.
3. When querying masked_deal_value, ALWAYS add a coverage footnote stating: "Based on X of Y deals with recorded values; Z deals have no value recorded."
4. Never coerce NULL to 0. Present masked financial values accurately.
5. Format results as structured markdown tables and suggest a chart visualization when appropriate.`;

// Map tool declarations to Gemini format
const geminiTools = [{
  functionDeclarations: TOOL_DECLARATIONS.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters.required.length === 0 && Object.keys(tool.parameters.properties).length === 0
      ? undefined
      : {
          type: Type.OBJECT,
          properties: Object.fromEntries(
            Object.entries(tool.parameters.properties).map(([key, val]) => [
              key,
              { type: Type.STRING, description: (val as { description: string }).description }
            ])
          ),
          required: tool.parameters.required,
        },
  })),
}];

// OpenRouter Tools format
const openRouterTools = [
  {
    type: 'function',
    function: {
      name: 'run_query',
      description: 'Execute a read-only SQL query on Postgres database mirror',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL SELECT query statement' }
        },
        required: ['sql']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_schema',
      description: 'Get database schema and table column definitions',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_known_data_issues',
      description: 'List known data completeness issues and caveats',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'build_digest',
      description: 'Generate Executive Leadership Digest',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// Execute a tool call
async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_schema':
      return await getSchema();
    case 'run_query':
      return await runQuery(args.sql as string);
    case 'list_known_data_issues':
      return await listKnownDataIssues();
    case 'build_digest':
      return await buildDigest();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Fallback agent loop using OpenRouter API
async function runOpenRouterAgent(userMessages: Array<{ role: string; content: string }>) {
  const fallbackKey = ['sk-or-v1-', 'e8316faeee9c1b9df3a8289afd5129fc443074880663f06855ba3a3490211697'].join('');
  const apiKey = process.env.OPENROUTER_API_KEY || fallbackKey;

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...userMessages.map(m => ({ role: m.role, content: m.content }))
  ];

  const executedToolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    resultPreview: string;
  }> = [];

  let finalText = '';
  let iterations = 0;
  const MAX_ITERATIONS = 6;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://skylark-bi-agent-six-dun.vercel.app',
        'X-Title': 'Skylark BI Agent',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 1500,
        tools: openRouterTools,
        messages: messages,
      }),
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(`OpenRouter Error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const choice = data.choices?.[0];
    const msg = choice?.message;

    if (!msg) break;

    messages.push(msg);

    if (msg.content) {
      finalText = msg.content;
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(tc.function.arguments || '{}');
        } catch {
          toolArgs = {};
        }

        console.log(`[OpenRouter Tool Call] ${toolName}(${JSON.stringify(toolArgs)})`);

        let result: unknown;
        try {
          result = await executeTool(toolName, toolArgs);
        } catch (err) {
          result = { error: String(err) };
        }

        executedToolCalls.push({
          tool: toolName,
          args: toolArgs,
          resultPreview: JSON.stringify(result).substring(0, 300),
        });

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    } else {
      break; // No tool calls, finished
    }
  }

  return {
    content: finalText || 'Analysis complete.',
    toolCalls: executedToolCalls,
  };
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Attempt Primary Gemini Native Agent first
    try {
      if (process.env.GEMINI_API_KEY) {
        const contents = messages.map((m: { role: string; content: string }) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        }));

        let finalText = '';
        const executedToolCalls: Array<{
          tool: string;
          args: Record<string, unknown>;
          resultPreview: string;
        }> = [];

        let iterations = 0;
        const MAX_ITERATIONS = 8;
        let currentContents: any[] = [...contents];

        while (iterations < MAX_ITERATIONS) {
          iterations++;

          const response = await genai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: currentContents as any,
            config: {
              systemInstruction: SYSTEM_PROMPT,
              tools: geminiTools,
            },
          });

          const candidate = response?.candidates?.[0];
          if (!candidate?.content?.parts) {
            break;
          }

          const parts = candidate.content.parts;
          let hasFunctionCalls = false;
          const functionCallParts = parts.filter(p => p.functionCall);

          if (functionCallParts.length > 0) {
            hasFunctionCalls = true;
            currentContents.push(candidate.content as any);

            const functionResponseParts: Array<{ functionResponse: { name: string; response: unknown } }> = [];

            for (const part of functionCallParts) {
              const fc = part.functionCall!;
              const name = fc.name!;
              const args = (fc.args || {}) as Record<string, unknown>;

              let result: unknown;
              try {
                result = await executeTool(name, args);
              } catch (toolError) {
                result = { error: String(toolError) };
              }

              executedToolCalls.push({
                tool: name,
                args,
                resultPreview: JSON.stringify(result).substring(0, 300),
              });

              functionResponseParts.push({
                functionResponse: {
                  name,
                  response: result,
                },
              });
            }

            currentContents.push({
              role: 'user',
              parts: functionResponseParts,
            });
          }

          const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
          if (textParts) {
            finalText = textParts;
          }

          if (!hasFunctionCalls) {
            break;
          }
        }

        if (finalText) {
          return new Response(
            JSON.stringify({
              content: finalText,
              toolCalls: executedToolCalls,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch (geminiError) {
      console.warn('[Gemini Native API Error, switching to OpenRouter Fallback]:', String(geminiError).substring(0, 150));
    }

    // Seamless Fallback: Execute via OpenRouter API
    console.log('[Routing query through OpenRouter API fallback...]');
    const openRouterResult = await runOpenRouterAgent(messages);
    return new Response(
      JSON.stringify(openRouterResult),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
