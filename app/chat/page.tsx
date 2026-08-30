'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Navbar } from '@/components/Navbar';
import { InlineChart } from '@/components/InlineChart';

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

function ChatContent() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>('Analyzing Request...');
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialUrlHandled = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: content.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setLoadingStage('[1/3] Inspecting Schema & Planning Query...');

    try {
      const timer = setTimeout(() => {
        setLoadingStage('[2/3] Executing SQL Query on Supabase Postgres...');
      }, 1200);

      const timer2 = setTimeout(() => {
        setLoadingStage('[3/3] Formatting Insights & Trust Footnotes...');
      }, 2400);

      const currentMsgs = [...messages, userMessage];

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      clearTimeout(timer);
      clearTimeout(timer2);

      const data = await res.json();
      
      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${data.error}. Please try again.`,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.content,
          toolCalls: data.toolCalls,
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection error: ${err}. Please check network.`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (initialUrlHandled.current) return;
    const initialQuery = searchParams.get('q');
    if (initialQuery && initialQuery.trim()) {
      initialUrlHandled.current = true;
      sendMessage(initialQuery);
    }
  }, [searchParams, sendMessage]);

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

  const extractChartData = (toolCalls?: ToolCall[]) => {
    if (!toolCalls) return null;
    const queryCall = toolCalls.find(tc => tc.tool === 'run_query' && tc.resultPreview);
    if (!queryCall) return null;
    try {
      const parsed = JSON.parse(queryCall.resultPreview);
      if (parsed.rows && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        return parsed.rows;
      }
    } catch {
      return null;
    }
    return null;
  };

  return (
    <main className="main-content">
      <div className="chat-container">
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="welcome-container">
              <div className="welcome-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <h1 className="welcome-title">Skylark BI Agent</h1>
              <p className="welcome-subtitle">
                AI-powered business intelligence assistant. Ask any question about deals pipeline
                or work orders — all answers are generated via read-only SQL queries against your monday.com Postgres mirror with explicit data coverage footnotes.
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

          {messages.map((msg, msgIdx) => {
            const chartData = msg.role === 'assistant' ? extractChartData(msg.toolCalls) : null;

            return (
              <div key={msgIdx} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? 'U' : 'AI'}
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
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                            </svg>
                            {tc.tool === 'run_query' ? `SQL Query Executed` : tc.tool === 'get_schema' ? 'Schema Inspected' : tc.tool === 'list_known_data_issues' ? 'Data Quality Inspected' : tc.tool === 'build_digest' ? 'Digest Built' : tc.tool}
                            {tc.tool === 'run_query' && typeof tc.args?.sql === 'string' && (
                              <span style={{ opacity: 0.7, marginLeft: 6, fontSize: '11px', fontFamily: 'var(--font-mono)' }}>[Click to view SQL]</span>
                            )}
                          </div>
                          <div className={`tool-call-detail ${expandedTools[`${msgIdx}-${toolIdx}`] ? 'expanded' : ''}`}>
                            {typeof tc.args?.sql === 'string' && (
                              <>
                                <strong style={{ color: 'var(--text-accent)' }}>Postgres SQL:</strong>
                                <pre><code>{tc.args.sql}</code></pre>
                              </>
                            )}
                            <strong style={{ color: 'var(--text-accent)' }}>Result Output:</strong>
                            <pre><code>{tc.resultPreview}</code></pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {chartData && (
                    <InlineChart data={chartData} title="Visualization" />
                  )}

                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="message assistant">
              <div className="message-avatar">AI</div>
              <div className="message-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  <div className="loading-dots">
                    <span /><span /><span />
                  </div>
                  <span>{loadingStage}</span>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
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
  );
}

export default function ChatPage() {
  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>
      <Navbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Suspense fallback={
          <div style={{ padding: 40, color: 'var(--text-tertiary)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            Loading Chat Agent...
          </div>
        }>
          <ChatContent />
        </Suspense>
      </div>
    </div>
  );
}
