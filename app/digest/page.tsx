'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';

interface DigestData {
  period: string;
  generated_at: string;
  pipeline_by_stage: Array<{
    deal_stage: string;
    deal_stage_order: number;
    deal_status: string;
    count: string;
    total_value: string | null;
    deals_with_value: string;
    deals_without_value: string;
  }>;
  pipeline_by_sector: Array<{
    sector_service: string;
    deal_status: string;
    count: string;
    total_value: string | null;
    deals_with_value: string;
  }>;
  revenue_won: {
    total_won_deals: string;
    won_deals_with_value: string;
    total_won_value: string | null;
    won_deals_without_value: string;
  };
  top_stalled_deals: Array<{
    deal_name: string;
    owner_code: string;
    client_code: string;
    deal_stage: string;
    sector_service: string;
    created_date: string;
    days_since_created: string;
    masked_deal_value: string | null;
  }>;
  work_order_execution: Array<{
    execution_status: string;
    count: string;
    total_amount: string | null;
    orders_with_amount: string;
  }>;
  ar_summary: {
    total_work_orders: string;
    total_receivable: string | null;
    orders_with_receivable: string;
    priority_accounts: string;
    open_receivable: string | null;
    closed_receivable: string | null;
  };
  anomalies: string[];
  data_quality_notes: string[];
}

function formatCurrency(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toFixed(0)}`;
}

function formatNumber(val: string | null): string {
  if (!val) return '0';
  return parseInt(val).toLocaleString();
}

export default function DigestPage() {
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDigest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/digest');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setDigest(data);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDigest();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const exportMarkdown = () => {
    if (!digest) return;

    let md = `# Leadership Digest — Skylark Drones\n\n`;
    md += `**Generated:** ${new Date(digest.generated_at).toLocaleString()}\n\n`;

    // Revenue Won
    md += `## Revenue Won\n\n`;
    md += `- Total Won Deals: ${digest.revenue_won.total_won_deals}\n`;
    md += `- Won Deals with Value: ${digest.revenue_won.won_deals_with_value}\n`;
    md += `- Total Won Value: ${formatCurrency(digest.revenue_won.total_won_value)}\n`;
    md += `- Won Deals without Value: ${digest.revenue_won.won_deals_without_value}\n\n`;

    // Pipeline by Stage
    md += `## Pipeline by Stage\n\n`;
    md += `| Stage | Status | Count | Total Value |\n|---|---|---|---|\n`;
    for (const row of digest.pipeline_by_stage) {
      md += `| ${row.deal_stage} | ${row.deal_status} | ${row.count} | ${formatCurrency(row.total_value)} |\n`;
    }
    md += '\n';

    // Work Order Execution
    md += `## Work Order Execution Status\n\n`;
    md += `| Status | Count | Total Amount |\n|---|---|---|\n`;
    for (const row of digest.work_order_execution) {
      md += `| ${row.execution_status || 'Unknown'} | ${row.count} | ${formatCurrency(row.total_amount)} |\n`;
    }
    md += '\n';

    // Anomalies
    if (digest.anomalies.length > 0) {
      md += `## ⚠️ Anomalies\n\n`;
      for (const a of digest.anomalies) {
        md += `- ${a}\n`;
      }
      md += '\n';
    }

    // Data Quality Notes
    md += `## Data Quality Notes\n\n`;
    for (const note of digest.data_quality_notes) {
      md += `- ${note}\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leadership-digest-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <div className="no-print">
        <Navbar />
      </div>

      <main className="main-content" style={{ flex: 1 }}>
        <div className="digest-container">
          <div className="digest-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="digest-title">📊 Executive Leadership Digest</h1>
              <p className="digest-meta">
                {digest
                  ? `Generated ${new Date(digest.generated_at).toLocaleString()} • ${digest.period}`
                  : 'Loading...'}
              </p>
            </div>
            <div className="no-print" style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={loadDigest} disabled={loading}>
                {loading ? '⟳ Loading...' : '⟳ Refresh'}
              </button>
              <button className="btn btn-secondary" onClick={handlePrint} disabled={!digest}>
                🖨️ Print / Save PDF
              </button>
              <button className="btn btn-primary" onClick={exportMarkdown} disabled={!digest}>
                📥 Export Markdown
              </button>
            </div>
          </div>

          {error && (
            <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 8, marginBottom: 24, color: 'var(--danger)' }}>
              Error: {error}. Make sure data is synced first (click &quot;Refresh Data&quot; in the header).
            </div>
          )}

          {loading && !digest && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
              <div className="loading-dots" style={{ justifyContent: 'center', marginBottom: 16 }}>
                <span /><span /><span />
              </div>
              Generating executive digest...
            </div>
          )}

          {digest && (
            <>
              {/* KPI Cards */}
              <div className="digest-grid">
                <div className="digest-card">
                  <div className="digest-card-title">Total Won Deals</div>
                  <div className="digest-card-value" style={{ color: 'var(--success)' }}>
                    {formatNumber(digest.revenue_won.total_won_deals)}
                  </div>
                  <div className="digest-card-label">
                    {digest.revenue_won.won_deals_with_value} with recorded value
                  </div>
                </div>

                <div className="digest-card">
                  <div className="digest-card-title">Total Won Value</div>
                  <div className="digest-card-value" style={{ color: 'var(--accent-primary)' }}>
                    {formatCurrency(digest.revenue_won.total_won_value)}
                  </div>
                  <div className="digest-card-label">
                    {digest.revenue_won.won_deals_without_value} deals have no value recorded
                  </div>
                </div>

                <div className="digest-card">
                  <div className="digest-card-title">Total Work Orders</div>
                  <div className="digest-card-value" style={{ color: 'var(--info)' }}>
                    {formatNumber(digest.ar_summary.total_work_orders)}
                  </div>
                  <div className="digest-card-label">
                    {formatNumber(digest.ar_summary.priority_accounts)} priority accounts
                  </div>
                </div>

                <div className="digest-card">
                  <div className="digest-card-title">Total Receivable</div>
                  <div className="digest-card-value" style={{ color: 'var(--warning)' }}>
                    {formatCurrency(digest.ar_summary.total_receivable)}
                  </div>
                  <div className="digest-card-label">
                    Open: {formatCurrency(digest.ar_summary.open_receivable)} | 
                    Closed: {formatCurrency(digest.ar_summary.closed_receivable)}
                  </div>
                </div>
              </div>

              {/* Anomalies */}
              {digest.anomalies.length > 0 && (
                <div className="digest-section">
                  <h2 className="digest-section-title" style={{ color: 'var(--warning)' }}>⚠️ Anomalies Detected</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {digest.anomalies.map((a, i) => (
                      <div key={i} className="coverage-note" style={{ margin: 0 }}>
                        {a}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Work Order Execution */}
              <div className="digest-section">
                <h2 className="digest-section-title">Work Order Execution Status</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-accent)', fontSize: 13 }}>Status</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid var(--border)', color: 'var(--text-accent)', fontSize: 13 }}>Count</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid var(--border)', color: 'var(--text-accent)', fontSize: 13 }}>Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {digest.work_order_execution.map((row, i) => (
                      <tr key={i}>
                        <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                          {row.execution_status || '(blank)'}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                          {row.count}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                          {formatCurrency(row.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Top Stalled Deals */}
              <div className="digest-section">
                <h2 className="digest-section-title">🔴 Top Stalled Deals (Open, Not Progressing)</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Deal', 'Owner', 'Client', 'Stage', 'Sector', 'Days Open', 'Value'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-accent)', fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {digest.top_stalled_deals.map((deal, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{deal.deal_name}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{deal.owner_code}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{deal.client_code}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{deal.deal_stage}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{deal.sector_service}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: parseInt(deal.days_since_created) > 180 ? 'var(--danger)' : 'var(--warning)' }}>
                          {deal.days_since_created}d
                        </td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{formatCurrency(deal.masked_deal_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pipeline by Sector */}
              <div className="digest-section">
                <h2 className="digest-section-title">Pipeline by Sector</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Sector', 'Status', 'Count', 'Total Value', 'With Value'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-accent)', fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {digest.pipeline_by_sector.map((row, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{row.sector_service}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                            background: row.deal_status === 'Won' ? 'rgba(34,197,94,0.15)' : row.deal_status === 'Open' ? 'rgba(59,130,246,0.15)' : row.deal_status === 'Dead' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                            color: row.deal_status === 'Won' ? 'var(--success)' : row.deal_status === 'Open' ? 'var(--accent-primary)' : row.deal_status === 'Dead' ? 'var(--danger)' : 'var(--warning)',
                          }}>
                            {row.deal_status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{row.count}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{formatCurrency(row.total_value)}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{row.deals_with_value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Data Quality Notes */}
              <div className="digest-section">
                <h2 className="digest-section-title">📋 Data Quality Notes</h2>
                {digest.data_quality_notes.map((note, i) => (
                  <div key={i} className="coverage-note" style={{ marginBottom: 8, marginTop: 0 }}>
                    {note}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
