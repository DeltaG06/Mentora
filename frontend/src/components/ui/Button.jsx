import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

// docs/ui-design-system.md §4.3. Every button has a visible text label.
const VARIANTS = {
  primary:
    'h-11 md:h-9 px-3.5 text-base bg-accent-700 text-white hover:bg-accent-800 active:bg-accent-900 disabled:bg-accent-200',
  secondary:
    'h-11 md:h-9 px-3.5 text-base border border-neutral-300 bg-neutral-0 text-neutral-800 hover:bg-neutral-50 disabled:text-neutral-400 disabled:hover:bg-neutral-0',
  destructive:
    'h-11 md:h-9 px-3.5 text-base border border-red-600 bg-neutral-0 text-red-600 hover:bg-red-50 disabled:border-red-300 disabled:text-red-300 disabled:hover:bg-neutral-0',
  text: 'min-h-[44px] md:min-h-0 text-sm text-accent-700 hover:underline disabled:text-neutral-400 disabled:no-underline',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', loading = false, icon: Icon, className = '', children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="h-4 w-4" aria-hidden />
      )}
      {children}
    </button>
  )
})

/** A router link styled as a button (for navigation actions). */
export function LinkButton({ to, variant = 'secondary', className = '', children }) {
  return (
    <Link
      to={to}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}
