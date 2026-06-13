'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { MetricPoint } from '@/types/contract';

interface Props {
  metrics: MetricPoint[];
  metricType?: string;
}

const INK = '#17150f';
const LINE = '#d8d1bf';
const MUTED = '#6b6557';

/** Short axis date, e.g. "Jun 12". */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Flat editorial progress line. No area gradient, no shadow — a thin ink trend
 * line over a dashed hairline grid, monospace ticks.
 */
export function ProgressChart({ metrics, metricType }: Props) {
  const data = useMemo(
    () =>
      [...metrics]
        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
        .map((m) => ({ ts: m.ts, label: shortDate(m.ts), value: m.value })),
    [metrics],
  );

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h3 className="label text-ink">Progress</h3>
        {metricType ? <span className="label">{metricType}</span> : null}
      </div>
      <div className="rule-ink mt-1.5" />

      {data.length === 0 ? (
        <div className="border border-line bg-card p-8 text-center mt-3">
          <p className="text-sm text-muted">No measurements logged yet.</p>
        </div>
      ) : (
        <div className="mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="label"
                stroke={LINE}
                tickLine={false}
                tick={{ fill: MUTED, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              />
              <YAxis
                stroke={LINE}
                tickLine={false}
                width={48}
                tick={{ fill: MUTED, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              />
              <Tooltip
                cursor={{ stroke: MUTED, strokeWidth: 1, strokeDasharray: '2 4' }}
                contentStyle={{
                  background: '#fcfaf4',
                  border: `1px solid ${INK}`,
                  borderRadius: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: INK,
                }}
                labelStyle={{ color: MUTED, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={INK}
                strokeWidth={1.5}
                dot={{ fill: INK, stroke: INK, r: 1.5 }}
                activeDot={{ fill: INK, stroke: INK, r: 2.5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
