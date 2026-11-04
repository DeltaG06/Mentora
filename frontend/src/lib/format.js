const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

const valid = (value) => value && !Number.isNaN(new Date(value).getTime())

export const formatDateTime = (value) => (valid(value) ? dateTimeFmt.format(new Date(value)) : '—')
export const formatDate = (value) => (valid(value) ? dateFmt.format(new Date(value)) : '—')
export const formatTime = (value) => (valid(value) ? timeFmt.format(new Date(value)) : '—')
export const formatWeekday = (value) => (valid(value) ? weekdayFmt.format(new Date(value)) : '—')

export function formatRange(start, end) {
  if (!valid(start)) return '—'
  return `${formatWeekday(start)}, ${formatTime(start)}–${formatTime(end)}`
}

export function relativeTime(value) {
  if (!valid(value)) return ''
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export const formatSgpa = (value) => (value === null || value === undefined ? '—' : Number(value).toFixed(2))

export function formatHours(hours) {
  if (hours === null || hours === undefined) return '—'
  if (hours < 48) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} days`
}

/** <input type="datetime-local"> value -> aware ISO timestamp (UTC). */
export function localInputToIso(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Aware ISO timestamp -> <input type="datetime-local"> value in local time. */
export function isoToLocalInput(value) {
  if (!valid(value)) return ''
  const date = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

export const RULE_LABELS = {
  F1: 'SGPA drop',
  F2: 'Subject below pass',
  F3: 'Low SGPA',
  F4: 'Weak internals',
  F5: 'Missed deadline',
}

export const titleCase = (value = '') => value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
