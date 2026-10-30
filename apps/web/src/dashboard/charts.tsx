import { useState, type ReactNode } from 'react';

// Small hand-made charts for the Live and Analytics pages. Series colours are --series-1 (blue) and --series-2
// (orange), validated for both themes; text never takes a series colour. Every chart has a hover tooltip and a
// table for screen readers.

export interface Series {
  name: string;
  slot: 1 | 2;
}

// The smallest of 2, 4, 6, 8 or 10 times a power of ten at or above n: close enough that bars use the height, and
// even, so the halfway gridline is a whole number too.
function niceCeil(n: number) {
  if (n <= 2) return 2;
  const power = 10 ** Math.floor(Math.log10(n));
  return [2, 4, 6, 8, 10].map((m) => m * power).find((v) => v >= n)!;
}

const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="chart-legend">
      {series.map((s) => (
        <span key={s.name}>
          <i className={`swatch slot-${s.slot}`} aria-hidden="true" />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export interface Column {
  label: string; // tooltip title and table row
  tick?: string; // x-axis label, shown on a few columns only
  values: number[]; // one per series, stacked bottom to top
  extra?: string[]; // more tooltip lines
  marks?: { icon: ReactNode; lines: string[] }; // events at this point, shown above the column
}

// Stacked columns from one baseline, with clean y ticks and an optional row of event marks above.
export function ColumnChart({ columns, series, height = 160, caption }: { columns: Column[]; series: Series[]; height?: number; caption: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceCeil(Math.max(...columns.map((c) => c.values.reduce((a, b) => a + b, 0)), 1));
  const ticks = [top, top / 2, 0];
  const hovered = hover === null ? null : columns[hover];

  return (
    <figure className="chart">
      {series.length > 1 && <Legend series={series} />}
      <div className={`col-chart ${columns.some((c) => c.marks) ? 'has-marks' : ''}`} style={{ height }}>
        <div className="col-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
              {compact(t)}
            </span>
          ))}
        </div>
        <div className="col-plot" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <i key={t} className="col-grid" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden="true" />
          ))}
          {columns.map((c, i) => (
            <div key={i} className={`col-slot ${hover === i ? 'hover' : ''}`} onMouseEnter={() => setHover(i)} aria-hidden="true">
              {c.marks && <span className="col-mark">{c.marks.icon}</span>}
              <div className="col-bar">
                {c.values.map((v, s) =>
                  v > 0 ? <i key={s} className={`slot-${series[s]!.slot}`} style={{ height: `${(v / top) * 100}%` }} /> : null,
                )}
              </div>
              {c.tick && <span className="col-tick">{c.tick}</span>}
            </div>
          ))}
          {hovered && hover !== null && (
            <div className="chart-tip" style={{ left: `${((hover + 0.5) / columns.length) * 100}%` }} role="status">
              <strong>{hovered.label}</strong>
              {series.map((s, i) => (
                <span key={s.name}>
                  <i className={`swatch slot-${s.slot}`} aria-hidden="true" />
                  {s.name}: {hovered.values[i]}
                </span>
              ))}
              {hovered.extra?.map((line, i) => (
                <span key={`x${i}`}>{line}</span>
              ))}
              {hovered.marks?.lines.map((line, i) => (
                <span key={i} className="muted">
                  {line}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th>{caption}</th>
            {series.map((s) => (
              <th key={s.name}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((c, i) => (
            <tr key={i}>
              <td>{c.label}</td>
              {c.values.map((v, s) => (
                <td key={s}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export interface BarRow {
  label: string;
  values: number[]; // one per series, laid end to end
  value: string; // shown at the end of the bar
  detail?: string; // extra line in the tooltip
}

// Horizontal bars, longest first, each labelled at its end.
export function BarList({ rows, series, caption }: { rows: BarRow[]; series: Series[]; caption: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.values.reduce((a, b) => a + b, 0)), 1);

  return (
    <figure className="chart">
      {series.length > 1 && <Legend series={series} />}
      <ul className="bar-list" onMouseLeave={() => setHover(null)} aria-hidden="true">
        {rows.map((r, i) => (
          <li key={r.label} onMouseEnter={() => setHover(i)} className={hover === i ? 'hover' : ''}>
            <span className="bar-label">{r.label}</span>
            <span className="bar-track">
              {r.values.map((v, s) =>
                v > 0 ? <i key={s} className={`slot-${series[s]!.slot}`} style={{ width: `${(v / max) * 100}%` }} /> : null,
              )}
            </span>
            <span className="bar-value">{r.value}</span>
            {hover === i && r.detail && <span className="chart-tip bar-tip">{r.detail}</span>}
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th>{r.label}</th>
              <td>
                {r.value}
                {r.detail ? `. ${r.detail}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
