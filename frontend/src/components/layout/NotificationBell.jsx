import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { api } from '../../api/client'
import { relativeTime } from '../../lib/format'

const POLL_MS = 60_000
export const NOTIFICATIONS_CHANGED = 'mentora:notifications-changed'

export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
}

export function NotificationBell() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)
  const box = useRef(null)
  const location = useLocation()

  const refresh = useCallback(() => {
    api
      .get('/notifications/unread-count')
      .then(({ data }) => setCount(data.count))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh)
    }
  }, [refresh])

  // Close on navigation and refresh the badge (actions often create notifications).
  useEffect(() => {
    setOpen(false)
    refresh()
  }, [location.pathname, refresh])

  useEffect(() => {
    if (!open) return undefined
    api
      .get('/notifications', { params: { page_size: 6 } })
      .then(({ data }) => setItems(data.items))
      .catch(() => setItems([]))
    const onClick = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const markRead = async (notification) => {
    if (notification.is_read) return
    try {
      await api.patch(`/notifications/${notification.id}/read`)
      setItems((list) => list.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)))
      setCount((c) => Math.max(0, c - 1))
    } catch {
      // The badge corrects itself on the next poll.
    }
  }

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all')
      setItems((list) => list?.map((n) => ({ ...n, is_read: true })) ?? list)
      setCount(0)
    } catch {
      // ignore; next poll resyncs
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-40 rounded-lg border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {count > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-medium text-brand-600 hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items === null && <li className="px-4 py-6 text-center text-sm text-slate-500">Loading…</li>}
            {items?.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-500">You're all caught up.</li>
            )}
            {items?.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => markRead(notification)}
                  className="flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.is_read ? 'bg-transparent' : 'bg-brand-600'}`}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className={`block text-sm ${notification.is_read ? 'text-slate-600' : 'font-medium text-slate-900'}`}>
                      {notification.title}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{notification.message}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">{relativeTime(notification.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link
            to="/notifications"
            className="block border-t border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-slate-50"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  )
}
