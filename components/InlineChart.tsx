'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

interface ChartProps {
  data: Array<Record<string, unknown>>;
  title?: string;
}

const COLORS = [
  '#3b82f6', // Accent blue
  '#8b5cf6', // Accent purple
  '#22c55e', // Success green
  '#eab308', // Warning yellow
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#f97316', // Orange
  '#6366f1', // Indigo
];

export function InlineChart({ data, title }: ChartProps) {
  if (!data || data.length === 0) return null;

  // Identify key label and numeric column dynamically
  const keys = Object.keys(data[0]);
  let labelKey = keys.find(k => typeof data[0][k] === 'string' && !k.includes('id')) || keys[0];
  let valueKey = keys.find(k => {
    const v = data[0][k];
    return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)) && !k.includes('date') && !k.includes('code'));
  }) || keys[1];

  if (!valueKey) return null;

  const formattedData = data.map((item, idx) => {
    const rawVal = item[valueKey];
    const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal)) || 0;
    const labelVal = String(item[labelKey] || `Item ${idx + 1}`);
    return {
      name: labelVal.length > 20 ? labelVal.substring(0, 18) + '...' : labelVal,
      value: numVal,
      fullName: labelVal,
    };
  }).slice(0, 12); // Limit to top 12 bars for visual clarity

  const isPieChart = formattedData.length <= 5;

  return (
    <div className="chart-container" style={{ margin: '16px 0', padding: '16px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
      {title && (
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-accent)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>📊</span> {title}
        </div>
      )}
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          {isPieChart ? (
            <PieChart>
              <Pie
                data={formattedData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={4}
                dataKey="value"
                label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''} (${((percent || 0) * 100).toFixed(0)}%)`}
              >
                {formattedData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1e2538', borderColor: 'rgba(148,163,184,0.2)', borderRadius: '8px', color: '#f1f5f9' }}
                formatter={(value: unknown) => [Number(value || 0).toLocaleString(), valueKey.replace(/_/g, ' ')]}
              />
            </PieChart>
          ) : (
            <BarChart data={formattedData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
              <XAxis
                dataKey="name"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
              />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e2538', borderColor: 'rgba(148,163,184,0.2)', borderRadius: '8px', color: '#f1f5f9' }}
                formatter={(value: unknown) => [Number(value || 0).toLocaleString(), valueKey.replace(/_/g, ' ')]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {formattedData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
