import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { api } from '../../api/client'
import { relativeTime } from '../../lib/format'
import { Skeleton } from '../ui/Feedback'

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

  // Actions often create notifications: close and refresh on navigation.
  useEffect(() => {
    setOpen(false)
    refresh()
  }, [location.pathname, refresh])

  useEffect(() => {
    if (!open) return undefined
    setItems(null)
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
      // The count resyncs on the next poll.
    }
  }

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all')
      setItems((list) => list?.map((n) => ({ ...n, is_read: true })) ?? list)
      setCount(0)
    } catch {
      // The count resyncs on the next poll.
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-1.5 rounded-md px-2 text-base text-neutral-700 hover:bg-neutral-50"
        aria-expanded={open}
        aria-label={`Notifications, ${count} unread`}
      >
        <Bell className="h-4 w-4 text-neutral-500" aria-hidden />
        <span className="hidden lg:inline">Notifications</span>
        <span className={count ? 'font-medium text-neutral-900' : 'text-neutral-400'}>{count > 99 ? '99+' : count}</span>
      </button>

      {open && (
        <div className="fixed inset-x-3 top-14 z-40 animate-enter rounded-md border border-neutral-200 bg-neutral-0 shadow-overlay sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
            <p className="text-sm font-semibold text-neutral-900">Notifications</p>
            {count > 0 && (
              <button type="button" onClick={markAll} className="text-sm font-medium text-accent-700 hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items === null &&
              [0, 1, 2].map((i) => (
                <li key={i} className="border-b border-neutral-200 px-4 py-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-full" />
                </li>
              ))}
            {items?.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-600">You have no notifications.</li>}
            {items?.map((notification) => (
              <li key={notification.id} className="border-b border-neutral-200 last:border-b-0">
                <button
                  type="button"
                  onClick={() => markRead(notification)}
                  className="flex w-full gap-3 px-4 py-3 text-left hover:bg-neutral-50"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.is_read ? '' : 'bg-neutral-800'}`}
                    aria-label={notification.is_read ? undefined : 'Unread'}
                  />
                  <span className="min-w-0">
                    <span className={`block text-sm ${notification.is_read ? 'text-neutral-600' : 'font-medium text-neutral-900'}`}>
                      {notification.title}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-neutral-500">{notification.message}</span>
                    <span className="mt-1 block text-xs text-neutral-400">{relativeTime(notification.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link
            to="/notifications"
            className="block border-t border-neutral-200 px-4 py-2.5 text-center text-sm font-medium text-accent-700 hover:underline"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  )
}
