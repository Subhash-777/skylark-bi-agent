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

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convert messages to Gemini format
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

    // Agent execution loop
    let iterations = 0;
    const MAX_ITERATIONS = 8; // Safety limit

    let currentContents: any[] = [...contents];
    const MODEL_FALLBACK_LIST = ['gemini-3.5-flash', 'gemini-3.6-flash'];

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      let response;
      let modelSuccess = false;

      for (const modelName of MODEL_FALLBACK_LIST) {
        try {
          response = await genai.models.generateContent({
            model: modelName,
            contents: currentContents as any,
            config: {
              systemInstruction: SYSTEM_PROMPT,
              tools: geminiTools,
            },
          });
          modelSuccess = true;
          break; // Succeeded with this model
        } catch (err) {
          const errStr = String(err);
          console.warn(`[Gemini API] Model ${modelName} failed/rate-limited:`, errStr.substring(0, 100));
          if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
            // Try next model in fallback list
            continue;
          }
          throw err;
        }
      }

      if (!modelSuccess || !response) {
        return new Response(
          JSON.stringify({ content: "Gemini API rate limit reached on free tier. Please wait 15-20 seconds before asking your next query." }),
          { headers: { 'Content-Type': 'application/json' } }
        );
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

          console.log(`[Agent Tool Call] ${name}(${JSON.stringify(args)})`);

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

        // Add tool results to conversation history
        currentContents.push({
          role: 'user',
          parts: functionResponseParts,
        });
      }

      // Extract text content if present
      const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
      if (textParts) {
        finalText = textParts;
      }

      // If no function calls, we are done
      if (!hasFunctionCalls) {
        break;
      }
    }

    return new Response(
      JSON.stringify({
        content: finalText || 'Analysis complete.',
        toolCalls: executedToolCalls,
      }),
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
