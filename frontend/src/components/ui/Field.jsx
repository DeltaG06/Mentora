import { forwardRef, useId } from 'react'

function FieldShell({ id, label, hint, error, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

export const Input = forwardRef(function Input(
  { label, hint, error, className, required, ...props },
  ref,
) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input
        ref={ref}
        id={id}
        required={required}
        className={`input ${error ? 'input-invalid' : ''}`}
        aria-invalid={Boolean(error)}
        {...props}
      />
    </FieldShell>
  )
})

export function Select({ label, hint, error, className, required, children, ...props }) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select
        id={id}
        required={required}
        className={`input pr-8 ${error ? 'input-invalid' : ''}`}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
}

export function Textarea({ label, hint, error, className, required, rows = 4, ...props }) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        id={id}
        rows={rows}
        required={required}
        className={`input ${error ? 'input-invalid' : ''}`}
        {...props}
      />
    </FieldShell>
  )
}
