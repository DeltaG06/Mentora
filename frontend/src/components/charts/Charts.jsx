import { useState } from 'react'

const BRAND = '#2c5696'
const GRID = '#e2e8f0'
const AXIS = '#64748b'

/**
 * Line chart of points [{ label, value }] on a fixed y-domain.
 * Used for the SGPA trend (0–10 scale, with an optional reference line).
 */
export function LineChart({ points, min = 0, max = 10, ticks = [0, 2, 4, 6, 8, 10], reference, height = 220 }) {
  const [hover, setHover] = useState(null)
  const width = 640
  const pad = { top: 24, right: 56, bottom: 36, left: 64 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v) => pad.top + innerH - ((v - min) / (max - min)) * innerH
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="SGPA by semester">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={pad.left - 28} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={AXIS}>
            {t}
          </text>
        </g>
      ))}
      {reference && (
        <g>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(reference.value)}
            y2={y(reference.value)}
            stroke="#dc2626"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text x={pad.left + 6} y={y(reference.value) + 15} textAnchor="start" fontSize="11" fill="#dc2626">
            {reference.label}
          </text>
        </g>
      )}
      <path d={path} fill="none" stroke={BRAND} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <circle cx={x(i)} cy={y(p.value)} r="14" fill="transparent" />
          <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 5.5 : 4} fill="#fff" stroke={BRAND} strokeWidth="2.5" />
          <text x={x(i)} y={y(p.value) - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f172a">
            {p.value.toFixed(2)}
          </text>
          <text x={x(i)} y={height - 12} textAnchor="middle" fontSize="11" fill={AXIS}>
            {p.label.length > 18 ? `${p.label.slice(0, 17)}…` : p.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** Horizontal bars [{ label, sublabel?, value }]. */
export function BarList({ rows, color = BRAND }) {
  const top = Math.max(1, ...rows.map((row) => row.value))
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">
              <span className="font-medium text-slate-900">{row.label}</span>
              {row.sublabel && <span className="ml-2 text-slate-500">{row.sublabel}</span>}
            </span>
            <span className="font-medium tabular-nums text-slate-900">{row.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${(row.value / top) * 100}%`, backgroundColor: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Vertical columns [{ label, value }], e.g. meetings per week. */
export function ColumnChart({ columns, height = 180 }) {
  const width = 640
  const pad = { top: 20, right: 8, bottom: 30, left: 8 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const top = Math.max(1, ...columns.map((c) => c.value))
  const slot = innerW / columns.length
  const bar = Math.min(44, slot * 0.6)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Completed meetings per week">
      <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke={GRID} />
      {columns.map((c, i) => {
        const h = (c.value / top) * innerH
        const cx = pad.left + slot * i + slot / 2
        return (
          <g key={c.label}>
            <rect
              x={cx - bar / 2}
              y={pad.top + innerH - h}
              width={bar}
              height={Math.max(h, c.value ? 2 : 0)}
              rx="3"
              fill={BRAND}
            />
            <text x={cx} y={pad.top + innerH - h - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">
              {c.value}
            </text>
            <text x={cx} y={height - 10} textAnchor="middle" fontSize="11" fill={AXIS}>
              {c.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
