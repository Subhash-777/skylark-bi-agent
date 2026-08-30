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
    badge: "Deals Pipeline",
  },
  {
    title: "Work Order Execution Status",
    query: "What's our work order execution status across all sectors?",
    desc: "Cross-tabulation of Execution Status × Sector across all 176 work orders",
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

      <main style={{ flex: 1, padding: '40px 24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {/* Hero Section */}
        <section style={{ textAlign: 'center', margin: '40px 0 60px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            background: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '20px',
            fontSize: '13px',
            color: 'var(--accent-primary)',
            fontWeight: 500,
            marginBottom: '20px',
          }}>
            <span>⚡</span> Skylark Drones BI Agent • Production Hosted
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 800,
            lineHeight: 1.15,
            marginBottom: '16px',
            background: 'linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Business Intelligence Powered by Code-Execution
          </h1>

          <p style={{
            fontSize: '16px',
            color: 'var(--text-secondary)',
            maxWidth: '720px',
            margin: '0 auto 36px',
            lineHeight: 1.6,
          }}>
            Query your monday.com Deals & Work Orders in natural language. Every aggregate is computed via real SQL queries over a Postgres mirror with explicit data coverage footnotes — never LLM arithmetic.
          </p>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/chat" className="btn btn-primary" style={{ padding: '12px 28px', fontSize: '15px' }}>
              Launch Chat Agent 🚀
            </Link>
            <Link href="/digest" className="btn btn-secondary" style={{ padding: '12px 28px', fontSize: '15px' }}>
              View Leadership Digest 📊
            </Link>
            <Link href="/about" className="btn btn-ghost" style={{ padding: '12px 28px', fontSize: '15px' }}>
              How It Works (Architecture) 📖
            </Link>
          </div>
        </section>

        {/* Live Metrics Grid */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
          marginBottom: '60px',
        }}>
          <div className="digest-card" style={{ textAlign: 'center' }}>
            <div className="digest-card-title">Deals Tracked</div>
            <div className="digest-card-value" style={{ color: 'var(--accent-primary)' }}>345</div>
            <div className="digest-card-label">Cleaned pipeline items across 16 stages</div>
          </div>
          <div className="digest-card" style={{ textAlign: 'center' }}>
            <div className="digest-card-title">Work Orders</div>
            <div className="digest-card-value" style={{ color: 'var(--success)' }}>176</div>
            <div className="digest-card-label">Tracked across execution & billing states</div>
          </div>
          <div className="digest-card" style={{ textAlign: 'center' }}>
            <div className="digest-card-title">Data Resilience</div>
            <div className="digest-card-value" style={{ color: 'var(--warning)' }}>100%</div>
            <div className="digest-card-label">Phantom header rows eliminated at sync</div>
          </div>
          <div className="digest-card" style={{ textAlign: 'center' }}>
            <div className="digest-card-title">Query Precision</div>
            <div className="digest-card-value" style={{ color: 'var(--info)' }}>SQL</div>
            <div className="digest-card-label">0% LLM arithmetic hallucination risk</div>
          </div>
        </section>

        {/* Clickable Sample Questions */}
        <section style={{ marginBottom: '60px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Try Example Queries</h2>
              <p style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>Click any chip to jump directly into the live agent chat</p>
            </div>
            <Link href="/chat" style={{ color: 'var(--text-accent)', fontSize: '14px', textDecoration: 'none' }}>
              View all suggested prompts →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {EXAMPLE_QUESTIONS.map((q, idx) => (
              <div
                key={idx}
                onClick={() => handleQuestionClick(q.query)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
                className="digest-card"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '12px', background: 'rgba(59,130,246,0.15)', color: 'var(--accent-primary)' }}>
                    {q.badge}
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>➔</span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  &quot;{q.query}&quot;
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {q.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Technical Differentiators */}
        <section style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '40px',
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', textAlign: 'center' }}>
            Why This Isn&apos;t Just Another Chatbot Wrapper
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🛡️</div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>Code Execution over Mirror</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Prompt-stuffing 500+ raw records into LLMs causes severe math errors. Our agent writes SELECT queries against Postgres to guarantee exact sums and counts.
              </p>
            </div>

            <div>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>Trust & Completeness Footnotes</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Every financial figure surfaces explicit null coverage (e.g. &quot;Masked Deal Value populated in 48% of deals&quot;), preventing misleading founder decisions.
              </p>
            </div>

            <div>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>Proactive Anomaly Alerts</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Automatically highlights data hygiene issues like Won deals missing Close Date or work orders marked billed with zero collected amount.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
