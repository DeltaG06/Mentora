import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

// docs/ui-design-system.md §4.9: bottom-right, monochrome, 4s.
const ToastContext = createContext(null)
const DURATION_MS = 4000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (tone, message) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-2), { id, tone, message }])
      setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:left-auto sm:items-end"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm animate-enter-up items-start gap-3 rounded-md bg-neutral-900 px-4 py-3 shadow-overlay ${
              toast.tone === 'error' ? 'border-l-[3px] border-red-500' : ''
            }`}
          >
            <p className="flex-1 text-sm text-white">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 text-sm font-medium text-neutral-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
