'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navbar() {
  const pathname = usePathname();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('skylark_last_synced');
    if (saved) setLastSynced(saved);
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const timeStr = new Date().toLocaleTimeString();
        setLastSynced(timeStr);
        localStorage.setItem('skylark_last_synced', timeStr);
      }
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <header className="no-print" style={{
      height: '56px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div className="sidebar-logo" style={{ cursor: 'pointer' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>Skylark BI Agent</span>
          </div>
        </Link>

        <nav style={{ display: 'flex', gap: '4px' }}>
          <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`} style={{ width: 'auto', padding: '6px 12px' }}>
            Overview
          </Link>
          <Link href="/chat" className={`nav-link ${pathname === '/chat' ? 'active' : ''}`} style={{ width: 'auto', padding: '6px 12px' }}>
            Chat Agent
          </Link>
          <Link href="/digest" className={`nav-link ${pathname === '/digest' ? 'active' : ''}`} style={{ width: 'auto', padding: '6px 12px' }}>
            Leadership Digest
          </Link>
          <Link href="/about" className={`nav-link ${pathname === '/about' ? 'active' : ''}`} style={{ width: 'auto', padding: '6px 12px' }}>
            How It Works
          </Link>
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="sync-status mono-data" style={{ fontSize: '11px' }}>
          <span className={`sync-dot ${isSyncing ? 'syncing' : ''}`} />
          <span>{lastSynced ? `Synced ${lastSynced}` : 'Monday.com Synced'}</span>
        </div>

        <button
          className={`sync-button ${isSyncing ? 'syncing' : ''}`}
          onClick={handleSync}
          disabled={isSyncing}
          title="Force fresh sync from Monday.com GraphQL API"
          style={{
            padding: '5px 10px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={isSyncing ? { animation: 'spin 1s linear infinite' } : {}}>
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {isSyncing ? 'Syncing...' : 'Refresh Data'}
        </button>
      </div>
    </header>
  );
}
