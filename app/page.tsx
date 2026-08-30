'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';

const EXAMPLE_QUESTIONS = [
  {
    title: "Mining Sector Pipeline",
    query: "How's our pipeline looking for the Mining sector?",
    desc: "Stage breakdown, status distribution & deal value coverage caveats",
    badge: "Deals Board",
  },
  {
    title: "Work Order Execution Status",
    query: "What's our work order execution status across all sectors?",
    desc: "Cross-tabulation of Execution Status × Sector across 176 work orders",
    badge: "Work Orders",
  },
  {
    title: "Longest Stuck Deals",
    query: "Which deals have been stuck without progress the longest?",
    desc: "Calculates days open delta from creation date for unclosed pipeline deals",
    badge: "Computed Metric",
  },
  {
    title: "Revenue Won by Sector",
    query: "Show me revenue won by sector",
    desc: "Aggregates closed-won deal values with explicit null-coverage notes",
    badge: "Financial BI",
  },
];

export default function LandingPage() {
  const router = useRouter();

  const handleQuestionClick = (query: string) => {
    router.push(`/chat?q=${encodeURIComponent(query)}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ flex: 1, padding: '40px 24px', maxWidth: '1140px', margin: '0 auto', width: '100%' }}>
        {/* Hero Section */}
        <section style={{ textAlign: 'center', margin: '32px 0 52px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            background: 'rgba(255, 107, 0, 0.1)',
            border: '1px solid rgba(255, 107, 0, 0.3)',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent-primary)',
            marginBottom: '20px',
          }}>
            <span>⚡</span> SKYLARK DRONES • FIELD-OPS BI ENGINE
          </div>

          <h1 style={{
            fontSize: 'clamp(28px, 4.5vw, 44px)',
            fontWeight: 800,
            lineHeight: 1.2,
            marginBottom: '16px',
            letterSpacing: '0.3px',
            color: '#f8fafc',
          }}>
            Natural Language BI Backed by SQL Code Execution
          </h1>

          <p style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            maxWidth: '720px',
            margin: '0 auto 32px',
            lineHeight: 1.6,
          }}>
            Query your monday.com Deals &amp; Work Orders in plain English. Every aggregate is calculated via real SQL queries over an optimized Postgres mirror with explicit data coverage footnotes — 0% LLM math hallucination.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/chat" className="btn btn-primary" style={{ padding: '10px 24px', fontSize: '14px' }}>
              Launch Chat Agent 🚀
            </Link>
            <Link href="/digest" className="btn btn-secondary" style={{ padding: '10px 24px', fontSize: '14px' }}>
              View Leadership Digest 📊
            </Link>
            <Link href="/about" className="btn btn-ghost" style={{ padding: '10px 24px', fontSize: '14px' }}>
              How It Works (Architecture) 📖
            </Link>
          </div>
        </section>

        {/* Industrial Stat Cards Grid */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '52px',
        }}>
          <div className="digest-card" style={{ borderTop: '2px solid var(--accent-primary)' }}>
            <div className="digest-card-title">Deals Tracked</div>
            <div className="digest-card-value mono-data" style={{ color: 'var(--accent-primary)' }}>345</div>
            <div className="digest-card-label">Cleaned pipeline rows across 16 stages</div>
          </div>
          <div className="digest-card" style={{ borderTop: '2px solid var(--status-won)' }}>
            <div className="digest-card-title">Work Orders</div>
            <div className="digest-card-value mono-data" style={{ color: 'var(--status-won)' }}>176</div>
            <div className="digest-card-label">Tracked across execution &amp; billing states</div>
          </div>
          <div className="digest-card" style={{ borderTop: '2px solid var(--status-hold)' }}>
            <div className="digest-card-title">Data Resilience</div>
            <div className="digest-card-value mono-data" style={{ color: 'var(--status-hold)' }}>100%</div>
            <div className="digest-card-label">Phantom header rows eliminated at sync</div>
          </div>
          <div className="digest-card" style={{ borderTop: '2px solid var(--status-info)' }}>
            <div className="digest-card-title">Query Precision</div>
            <div className="digest-card-value mono-data" style={{ color: 'var(--status-info)' }}>SQL</div>
            <div className="digest-card-label">Postgres execution; zero prompt-stuffing</div>
          </div>
        </section>

        {/* Clickable Sample Questions */}
        <section style={{ marginBottom: '52px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.3px' }}>Try Example Queries</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Click any prompt chip to execute directly in the live agent chat</p>
            </div>
            <Link href="/chat" style={{ color: 'var(--accent-primary)', fontSize: '13px', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
              All Prompts ➔
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>
            {EXAMPLE_QUESTIONS.map((q, idx) => (
              <div
                key={idx}
                onClick={() => handleQuestionClick(q.query)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '18px',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
                className="digest-card"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, padding: '2px 6px', borderRadius: '2px', background: 'rgba(255,107,0,0.12)', color: 'var(--accent-primary)' }}>
                    {q.badge}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>➔</span>
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  &quot;{q.query}&quot;
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {q.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Industrial Technical Features */}
        <section style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '28px',
          marginBottom: '32px',
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', textAlign: 'center', letterSpacing: '0.3px' }}>
            Engineered Business Intelligence Core
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            <div>
              <div style={{ fontSize: '18px', color: 'var(--accent-primary)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>01 // SQL CODE EXECUTION</div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Postgres Code Execution</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Prompt-stuffing 500+ raw records causes severe math errors. Our agent writes SELECT queries against Postgres to guarantee exact sums and counts.
              </p>
            </div>

            <div>
              <div style={{ fontSize: '18px', color: 'var(--accent-primary)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>02 // TRUST &amp; FOOTNOTES</div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Completeness Footnotes</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Every financial figure surfaces explicit null coverage (e.g. &quot;Masked Deal Value populated in 48% of deals&quot;), preventing misleading decisions.
              </p>
            </div>

            <div>
              <div style={{ fontSize: '18px', color: 'var(--accent-primary)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>03 // ANOMALY DETECTION</div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Proactive Anomaly Alerts</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Automatically highlights data hygiene issues like Won deals missing Close Date or work orders marked billed with zero collected amount.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
