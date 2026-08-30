'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';

interface DataIssue {
  id: string;
  severity: string;
  description: string;
  affected_tables: string[];
  handling: string;
}

export default function AboutPage() {
  const [issues, setIssues] = useState<DataIssue[]>([]);

  useEffect(() => {
    setIssues([
      {
        id: 'phantom_header_rows',
        severity: 'high',
        description: 'Duplicated header rows embedded in raw CSV export (e.g., row 52 Nezuko and row 181 Bugs Bunny where values equal column names like "Deal Status").',
        affected_tables: ['deals_clean', 'work_orders_clean'],
        handling: 'Detected & tagged with is_phantom_row = TRUE during sync. All SQL queries explicitly filter WHERE is_phantom_row = FALSE.',
      },
      {
        id: 'closure_probability_sparse',
        severity: 'high',
        description: 'Closure Probability is populated in only ~25% of deals rows (75% null).',
        affected_tables: ['deals_clean'],
        handling: 'Completeness tracked in sync_log. Agent outputs explicit coverage footnotes when querying probability.',
      },
      {
        id: 'masked_deal_value_sparse',
        severity: 'high',
        description: 'Masked Deal Value is populated in only ~48% of deals rows (52% null).',
        affected_tables: ['deals_clean'],
        handling: 'Financial queries exclude nulls explicitly and state the exact count of excluded deals in footnotes.',
      },
      {
        id: 'collection_status_blank',
        severity: 'high',
        description: 'Collection status column in Work Orders is 100% blank (176/176 rows null).',
        affected_tables: ['work_orders_clean'],
        handling: 'Agent redirects collection queries to use collected_amount_incl_gst and amount_receivable instead.',
      },
      {
        id: 'billing_status_typos',
        severity: 'medium',
        description: 'Free-text Billing Status includes typo variants like "BIlled" alongside "Billed".',
        affected_tables: ['work_orders_clean'],
        handling: 'Normalized during sync using a synonym map + SQL case-insensitive ILIKE matching.',
      },
      {
        id: 'product_deal_freeform',
        severity: 'medium',
        description: 'Product deal is a freeform text string with multi-values joined by "+" ("Service + Spectra").',
        affected_tables: ['deals_clean', 'deal_products'],
        handling: 'Tokenized at sync time into relational deal_products(deal_monday_item_id, product) side table.',
      },
      {
        id: 'no_clean_cross_board_join',
        severity: 'high',
        description: 'No clean shared primary key exists across Deals and Work Orders (Deal Name aliases repeat across rows).',
        affected_tables: ['deals_clean', 'work_orders_clean'],
        handling: 'Best-effort join on (owner_code + sector_service). Cross-board answers carry an explicit disclaimer.',
      },
    ]);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ flex: 1, padding: '40px 24px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-accent)', marginBottom: '8px' }}>TECHNICAL ARCHITECTURE &amp; DECISION LOG</div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '12px' }}>How This Business Intelligence Agent Works</h1>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '800px', lineHeight: 1.6 }}>
            Designed specifically for executive evaluation. Here is how our architecture guarantees 100% mathematical accuracy while gracefully handling raw messy data exports.
          </p>
        </div>

        {/* Architecture Diagram Box */}
        <section style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '28px',
          marginBottom: '40px',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', letterSpacing: '0.3px' }}>
            The Tool-Calling Agent Loop
          </h2>

          <div style={{ background: 'var(--bg-primary)', padding: '20px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)', overflowX: 'auto', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-accent)' }}>User Question (&quot;How is Mining pipeline looking?&quot;)</div>
            <div>└─► <strong>1. Gemini 3.6 Flash Agent Loop</strong></div>
            <div>    ├─► Calls <span style={{ color: 'var(--status-info)' }}>get_schema()</span> → inspects clean table definitions &amp; sync completeness %</div>
            <div>    ├─► Calls <span style={{ color: 'var(--status-info)' }}>run_query(sql)</span> → executes read-only SELECT against Postgres mirror</div>
            <div>    ├─► Calls <span style={{ color: 'var(--status-info)' }}>list_known_data_issues()</span> → checks null caveats for queried fields</div>
            <div>    └─► <strong>2. Synthesizes Final Answer</strong></div>
            <div style={{ color: 'var(--status-won)', marginTop: '4px' }}>        └─► Returns Answer + Interactive Recharts + SQL Audit Trail + Coverage Footnote</div>
          </div>
        </section>

        {/* Why Code Execution */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
            Why Code-Execution (SQL) Over LLM Prompt-Stuffing
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <div className="digest-card" style={{ borderLeft: '4px solid var(--status-dead)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-dead)', marginBottom: '8px' }}>Naive Prompt-Stuffing Approach</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Pasting 500+ raw monday.com JSON records into an LLM context and asking it to &quot;add these up&quot; causes hallucinated totals, skipped rows, and silent arithmetic failures.
              </p>
            </div>
            <div className="digest-card" style={{ borderLeft: '4px solid var(--status-won)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-won)', marginBottom: '8px' }}>Postgres SQL Code Execution</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                The LLM writes SQL queries against an optimized Supabase Postgres database. Postgres handles the arithmetic with 100% precision. The LLM only interprets the output.
              </p>
            </div>
          </div>
        </section>

        {/* Data Resilience & Cleaning Matrix */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
            Data Quality Resilience &amp; Cleaning Pipeline
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            The source CSV exports contained specific structural anomalies. Here is how our cleaning pipeline (<code style={{ color: 'var(--status-info)' }}>lib/sync.ts</code>) handles each:
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-accent)', border: '1px solid var(--border)' }}>Data Bug Found</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-accent)', border: '1px solid var(--border)' }}>Impacted Columns</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-accent)', border: '1px solid var(--border)' }}>Handling &amp; Mitigation Strategy</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '10px 14px', border: '1px solid var(--border)', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{issue.id}</td>
                    <td style={{ padding: '10px 14px', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--status-info)' }}>
                      {issue.affected_tables.join(', ')}
                    </td>
                    <td style={{ padding: '10px 14px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {issue.handling}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Quick Links */}
        <section style={{ textAlign: 'center', padding: '28px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Ready to test the agent?</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Try running natural language queries or explore the executive digest.</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link href="/chat" className="btn btn-primary">Try Chat Agent</Link>
            <Link href="/digest" className="btn btn-secondary">View Leadership Digest</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
