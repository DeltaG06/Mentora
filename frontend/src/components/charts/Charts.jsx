import { useState } from 'react'

// docs/ui-design-system.md §4.11. Hex values mirror the design tokens.
const LINE = '#A8A29E' // neutral-400
const MARKER = '#1E3A5F' // accent-700
const RISK = '#D92D20' // red-500, flag semantics only
const GRID = '#E7E5E4' // neutral-200
const AXIS = '#78716C' // neutral-500
const INK = '#1C1917' // neutral-900
const BAR = '#D6D3D1' // neutral-300

const FONT = { fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }

/**
 * Line chart of points [{ label, value }] on a fixed y-domain (SGPA, 0–10).
 * Points below `threshold.value` are drawn in red: that is the F3 rule.
 */
export function LineChart({ points, min = 0, max = 10, ticks = [0, 2, 4, 6, 8, 10], threshold, height = 220 }) {
  const [hover, setHover] = useState(null)
  const width = 640
  const pad = { top: 24, right: 56, bottom: 36, left: 64 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v) => pad.top + innerH - ((v - min) / (max - min)) * innerH
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="SGPA by semester" style={FONT}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={pad.left - 28} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill={AXIS}>
            {t}
          </text>
        </g>
      ))}
      {threshold && (
        <g>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(threshold.value)}
            y2={y(threshold.value)}
            stroke={LINE}
            strokeDasharray="4 4"
          />
          <text x={pad.left + 6} y={y(threshold.value) + 15} fontSize="12" fill={AXIS}>
            {threshold.label}
          </text>
        </g>
      )}
      {points.length > 1 && <path d={path} fill="none" stroke={LINE} strokeWidth="1.5" strokeLinejoin="round" />}
      {points.map((p, i) => {
        const risk = threshold && p.value < threshold.value
        return (
          <g key={p.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(i)} cy={y(p.value)} r="14" fill="transparent" />
            <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3.5} fill={risk ? RISK : MARKER} stroke="#fff" strokeWidth="1.5" />
            <text x={x(i)} y={y(p.value) - 11} textAnchor="middle" fontSize="12" fill={INK}>
              {p.value.toFixed(2)}
            </text>
            <text x={x(i)} y={height - 12} textAnchor="middle" fontSize="12" fill={AXIS}>
              {p.label.length > 18 ? `${p.label.slice(0, 17)}…` : p.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Horizontal bars [{ label, sublabel?, value }] in neutral. */
export function BarList({ rows }) {
  const top = Math.max(1, ...rows.map((row) => row.value))
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-mono text-xs font-medium text-neutral-800">{row.label}</span>
              {row.sublabel && <span className="ml-2 text-neutral-600">{row.sublabel}</span>}
            </span>
            <span className="text-neutral-900">{row.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-neutral-300" style={{ width: `${(row.value / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Vertical columns [{ label, value }], e.g. meetings per week. */
export function ColumnChart({ columns, height = 180 }) {
  const [hover, setHover] = useState(null)
  const width = 640
  const pad = { top: 20, right: 8, bottom: 30, left: 8 }
  const innerH = height - pad.top - pad.bottom
  const top = Math.max(1, ...columns.map((c) => c.value))
  const slot = (width - pad.left - pad.right) / columns.length
  const bar = Math.min(40, slot * 0.6)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Meetings held per week" style={FONT}>
      <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke={GRID} />
      {columns.map((c, i) => {
        const h = (c.value / top) * innerH
        const cx = pad.left + slot * i + slot / 2
        return (
          <g key={c.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={cx - slot / 2} y={pad.top} width={slot} height={innerH} fill="transparent" />
            <rect
              x={cx - bar / 2}
              y={pad.top + innerH - h}
              width={bar}
              height={Math.max(h, c.value ? 2 : 0)}
              rx="2"
              fill={hover === i ? MARKER : BAR}
            />
            <text x={cx} y={pad.top + innerH - h - 6} textAnchor="middle" fontSize="12" fill={INK}>
              {c.value}
            </text>
            <text x={cx} y={height - 10} textAnchor="middle" fontSize="12" fill={AXIS}>
              {c.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
