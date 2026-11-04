import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'

/**
 * Dialog (docs/ui-design-system.md §4.8). A bottom sheet below `sm`.
 * Esc closes it, focus is trapped inside and returns to the trigger.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const panel = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKey = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    const field = panel.current?.querySelector(
      'input:not([type=hidden]):not([disabled]):not([type=checkbox]), textarea:not([disabled]), select:not([disabled])',
    )
    ;(field || panel.current)?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])

  if (!open) return null
  const width = size === 'lg' ? 'sm:max-w-3xl' : size === 'sm' ? 'sm:max-w-md' : 'sm:max-w-xl'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-[rgba(28,25,23,0.4)]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full animate-enter flex-col rounded-t-md border border-neutral-200 bg-neutral-0 shadow-overlay outline-none sm:rounded-md ${width}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <h2 className="text-md font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900 md:min-h-0"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">{children}</div>
        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-neutral-200 px-4 py-3 sm:flex-row sm:justify-end md:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
