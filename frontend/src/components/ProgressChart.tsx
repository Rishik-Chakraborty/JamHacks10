/**
 * ProgressChart — recharts line chart of a challenge's metric points
 * (value over time). Handles the empty case gracefully.
 */
'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { MetricPoint, MetricType } from '@/types/contract';

export interface ProgressChartProps {
  metrics: MetricPoint[];
  metricType: MetricType;
  className?: string;
}

const UNIT: Record<MetricType, string> = {
  weight: 'lbs',
  bench: 'lbs',
  visual: '',
};

function fmtTs(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ProgressChart({ metrics, metricType, className = '' }: ProgressChartProps) {
  const data = useMemo(
    () =>
      [...metrics]
        .filter((m) => Number.isFinite(m.value))
        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
        .map((m) => ({ ts: m.ts, label: fmtTs(m.ts), value: m.value })),
    [metrics],
  );

  if (data.length === 0) {
    return (
      <div
        className={`flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted ${className}`}
      >
        No metric data yet — progress will appear here as photos are posted.
      </div>
    );
  }

  const unit = UNIT[metricType];

  return (
    <div className={`h-56 w-full ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--muted)"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            stroke="var(--muted)"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={false}
            width={48}
            unit={unit ? ` ${unit}` : undefined}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              color: 'var(--foreground)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--muted)' }}
            formatter={(value) => [
              unit ? `${value} ${unit}` : `${value}`,
              metricType,
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--brand)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--brand)', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'var(--accent)', strokeWidth: 0 }}
            isAnimationActive
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
