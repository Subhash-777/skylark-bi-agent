/**
 * /api/chat — Agent loop endpoint using Google Gemini with tool-calling.
 * 
 * Implements PLAN.md §6:
 * - Multi-turn tool-calling loop (get_schema → run_query → narrate)
 * - Streaming responses via SSE
 * - Every number comes from SQL, never from LLM eyeballing raw data
 * - Coverage footnotes for sparse columns
 */
import { NextRequest } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { getSchema, runQuery, listKnownDataIssues, buildDigest, TOOL_DECLARATIONS } from '@/lib/tools';

const SYSTEM_PROMPT = `You are a Business Intelligence analyst for Skylark Drones, helping leadership understand their deals pipeline and work orders.

CRITICAL RULES:
1. NEVER compute numbers yourself. ALWAYS use the run_query tool to execute SQL queries for any numerical answer.
2. Before writing any SQL, call get_schema() to understand the available tables, columns, and data completeness.
3. When a query touches columns with known low completeness (check via list_known_data_issues), ALWAYS add a coverage footnote like "Based on X of Y deals with recorded values; Z deals have no value recorded."
4. NEVER silently coerce NULL to 0. NULL means "unknown," not "zero."
5. Always include WHERE is_phantom_row = FALSE in queries on deals_clean and work_orders_clean.
6. For cross-board (deals + work orders) questions, note that there's no clean join key — any cross-board analysis uses approximate matching.
7. When results are naturally chart-shaped (pipeline by stage, revenue by sector), format them as a table AND suggest a chart visualization.
8. If a user's question is ambiguous (e.g., "this quarter" without fiscal year context, or a sector name that doesn't exactly match), ask a STRUCTURED clarifying question — provide 2-4 specific options from the actual data values.
9. Financial values are masked but internally consistent. Present them as numbers but note they are masked/representative.
10. Keep answers concise but include the data coverage footnote when relevant.

AVAILABLE TABLES:
- deals_clean: Deal pipeline data (346 rows, 12+ columns including deal_name, deal_status, deal_stage, masked_deal_value, sector_service, etc.)
- work_orders_clean: Work order tracker (176 rows, 38+ columns including execution_status, billing_status, financial columns, sector, etc.)
- deal_products: Tokenized product deals (join on deal_monday_item_id)
- sync_log: Data completeness stats per column

Start every interaction by understanding the question, then use tools to get accurate data.`;

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
      return await buildDigest(args.period as string | undefined);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json() as {
      messages: Array<{ role: string; content: string }>
    };

    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Build conversation history for Gemini
    const contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }> }> = [];

    for (const msg of messages) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    // Tool-calling loop
    const toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> = [];
    let finalText = '';
    let iterations = 0;
    const MAX_ITERATIONS = 8; // Safety limit

    let currentContents = [...contents];

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      let response;
      let retryCount = 0;
      const MAX_RETRIES = 3;

      while (retryCount <= MAX_RETRIES) {
        try {
          response = await genai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: currentContents as any,
            config: {
              systemInstruction: SYSTEM_PROMPT,
              tools: geminiTools,
            },
          });
          break; // Success
        } catch (err) {
          const errStr = String(err);
          if ((errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) && retryCount < MAX_RETRIES) {
            retryCount++;
            const backoffMs = retryCount * 3000;
            console.log(`[Gemini API] Rate limit (429) hit, retrying in ${backoffMs}ms (attempt ${retryCount}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          } else {
            if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
              return new Response(
                JSON.stringify({ content: "The Gemini API free tier rate limit was reached (20 requests/min). Please wait ~15-20 seconds before asking your next query." }),
                { headers: { 'Content-Type': 'application/json' } }
              );
            }
            throw err;
          }
        }
      }

      const candidate = response?.candidates?.[0];
      if (!candidate?.content?.parts) {
        finalText = 'I was unable to generate a response. Please try again.';
        break;
      }

      const parts = candidate.content.parts;
      let hasFunctionCalls = false;

      // Check for function calls
      const functionCallParts = parts.filter(p => p.functionCall);

      if (functionCallParts.length > 0) {
        hasFunctionCalls = true;

        // Add model's response to history (preserves thoughtSignature and original structure)
        currentContents.push(candidate.content as any);

        // Execute each function call and add results
        const functionResponseParts: Array<{ functionResponse: { name: string; response: unknown } }> = [];

        for (const part of functionCallParts) {
          const fc = part.functionCall!;
          const name = fc.name!;
          const args = (fc.args || {}) as Record<string, unknown>;

          console.log(`[Agent] Tool call: ${name}(${JSON.stringify(args).substring(0, 200)})`);
          const result = await executeTool(name, args);
          console.log(`[Agent] Tool result: ${JSON.stringify(result).substring(0, 200)}...`);

          toolCalls.push({ tool: name, args, result });

          functionResponseParts.push({
            functionResponse: {
              name,
              response: result,
            },
          });
        }

        currentContents.push({
          role: 'user',
          parts: functionResponseParts as Array<{ functionResponse: unknown }>,
        });
      }

      if (!hasFunctionCalls) {
        // Final text response
        finalText = parts
          .filter(p => p.text)
          .map(p => p.text)
          .join('');
        break;
      }
    }

    if (iterations >= MAX_ITERATIONS && !finalText) {
      finalText = 'I reached the maximum number of tool calls. Here is what I found so far — please try a more specific question.';
    }

    // Return the response with tool call audit trail
    return new Response(
      JSON.stringify({
        content: finalText,
        toolCalls: toolCalls.map(tc => ({
          tool: tc.tool,
          args: tc.args,
          // Truncate large results for the response
          resultPreview: JSON.stringify(tc.result).substring(0, 500),
        })),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Chat API error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
