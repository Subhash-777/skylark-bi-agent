'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  resultPreview: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

const SUGGESTED_QUESTIONS = [
  "How's our pipeline looking for the Mining sector?",
  "What's our work order execution status across all sectors?",
  "Which deals have been stuck without progress the longest?",
  "Show me revenue won by sector",
  "What's the billing status across work orders?",
  "Give me a leadership digest",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLastSynced(new Date().toLocaleTimeString());
      } else {
        console.error('Sync failed:', data.error);
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: content.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      
      if (data.error) {
        setMessages([...newMessages, {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${data.error}. Please try again.`,
        }]);
      } else {
        setMessages([...newMessages, {
          role: 'assistant',
          content: data.content,
          toolCalls: data.toolCalls,
        }]);
      }
    } catch (err) {
      setMessages([...newMessages, {
        role: 'assistant',
        content: `Connection error: ${err}. Please check if the server is running.`,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const toggleToolDetail = (msgIdx: number, toolIdx: number) => {
    const key = `${msgIdx}-${toolIdx}`;
    setExpandedTools(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Skylark BI Agent
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <a href="/chat" className="nav-link active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat
          </a>
          <a href="/digest" className="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 17H7v-7h2m4 0h-2v7h2m4-10H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" />
              <path d="M17 7V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2" />
            </svg>
            Leadership Digest
          </a>
          <button className={`nav-link ${isSyncing ? 'syncing' : ''}`} onClick={handleSync}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={isSyncing ? { animation: 'spin 1s linear infinite' } : {}}>
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {isSyncing ? 'Syncing...' : 'Refresh Data'}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sync-status">
            <span className={`sync-dot ${isSyncing ? 'syncing' : ''}`} />
            {lastSynced ? `Synced at ${lastSynced}` : 'Not synced yet'}
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="main-content">
        <div className="chat-container">
          <div className="chat-header">
            <div>
              <div className="chat-title">Business Intelligence Chat</div>
              <div className="chat-subtitle">Ask questions about your deals pipeline and work orders</div>
            </div>
            <button className={`sync-button ${isSyncing ? 'syncing' : ''}`} onClick={handleSync}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {isSyncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="welcome-container">
                <div className="welcome-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <h1 className="welcome-title">Skylark BI Agent</h1>
                <p className="welcome-subtitle">
                  I&apos;m your AI-powered business intelligence assistant. I can analyze your deals pipeline,
                  work order status, revenue metrics, and more — all backed by real SQL queries against your
                  monday.com data. Every number I give you comes from an actual database query, not guesswork.
                </p>
                <div className="suggested-questions">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      className="suggestion-chip"
                      onClick={() => sendMessage(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, msgIdx) => (
              <div key={msgIdx} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? 'U' : '⚡'}
                </div>
                <div className="message-content">
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="tool-calls">
                      {msg.toolCalls.map((tc, toolIdx) => (
                        <div key={toolIdx}>
                          <div
                            className="tool-call"
                            onClick={() => toggleToolDetail(msgIdx, toolIdx)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                            </svg>
                            {tc.tool === 'run_query' ? `SQL Query` : tc.tool === 'get_schema' ? 'Schema Lookup' : tc.tool === 'list_known_data_issues' ? 'Data Quality Check' : tc.tool === 'build_digest' ? 'Building Digest' : tc.tool}
                            {tc.tool === 'run_query' && typeof tc.args?.sql === 'string' && (
                              <span style={{ opacity: 0.6, marginLeft: 4 }}>— click to show query</span>
                            )}
                          </div>
                          <div className={`tool-call-detail ${expandedTools[`${msgIdx}-${toolIdx}`] ? 'expanded' : ''}`}>
                            {typeof tc.args?.sql === 'string' && (
                              <>
                                <strong style={{ color: 'var(--text-accent)' }}>SQL:</strong>
                                <pre><code>{tc.args.sql}</code></pre>
                              </>
                            )}
                            <strong style={{ color: 'var(--text-accent)' }}>Result:</strong>
                            <pre><code>{tc.resultPreview}</code></pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="message assistant">
                <div className="message-avatar">⚡</div>
                <div className="message-content">
                  <div className="loading-dots">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-container">
            <div className="chat-input-wrapper">
              <textarea
                ref={inputRef}
                className="chat-input"
                placeholder="Ask about your deals pipeline, work orders, revenue..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isLoading}
              />
              <button
                className="send-button"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            {messages.length > 0 && (
              <div className="suggested-questions" style={{ marginTop: 8 }}>
                {SUGGESTED_QUESTIONS.slice(0, 3).map((q, i) => (
                  <button
                    key={i}
                    className="suggestion-chip"
                    onClick={() => sendMessage(q)}
                    disabled={isLoading}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
