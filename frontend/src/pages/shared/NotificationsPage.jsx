import { useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { notifyNotificationsChanged } from '../../components/layout/NotificationBell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { useToast } from '../../components/ui/Toast'
import { formatDateTime, relativeTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20

export default function NotificationsPage() {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const state = useApi('/notifications', { page, page_size: PAGE_SIZE })
  const [busy, setBusy] = useState(false)

  const markRead = async (notification) => {
    if (notification.is_read) return
    try {
      await api.patch(`/notifications/${notification.id}/read`)
      state.setData((data) => ({
        ...data,
        items: data.items.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
      }))
      notifyNotificationsChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const markAll = async () => {
    setBusy(true)
    try {
      await api.post('/notifications/read-all')
      state.setData((data) => ({ ...data, items: data.items.map((n) => ({ ...n, is_read: true })) }))
      notifyNotificationsChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const hasUnread = state.data?.items.some((n) => !n.is_read)

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your records, flags and meetings."
        actions={
          <Button variant="secondary" icon={CheckCheck} onClick={markAll} loading={busy} disabled={!hasUnread}>
            Mark all as read
          </Button>
        }
      />
      <Card bodyClassName="">
        <Loadable state={state}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState icon={Bell} title="No notifications yet">
                You will be notified when something needs your attention.
              </EmptyState>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {data.items.map((notification) => (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => markRead(notification)}
                        className={`flex w-full gap-3 px-4 py-4 text-left sm:px-5 ${
                          notification.is_read ? 'cursor-default' : 'bg-brand-50/40 hover:bg-brand-50'
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            notification.is_read ? 'bg-slate-200' : 'bg-brand-600'
                          }`}
                          aria-label={notification.is_read ? 'Read' : 'Unread'}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span
                              className={`text-sm ${notification.is_read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}
                            >
                              {notification.title}
                            </span>
                            <time
                              className="text-xs text-slate-400"
                              dateTime={notification.created_at}
                              title={formatDateTime(notification.created_at)}
                            >
                              {relativeTime(notification.created_at)}
                            </time>
                          </span>
                          <span className="mt-0.5 block text-sm text-slate-600">{notification.message}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
              </>
            )
          }
        </Loadable>
      </Card>
    </>
  )
}
