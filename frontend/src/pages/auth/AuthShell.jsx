// docs/ui-design-system.md §6.7: form left, one institutional panel right.
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-neutral-0">
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <p className="text-lg font-semibold text-neutral-900">Mentora</p>
            <p className="text-sm text-neutral-500">Goa College of Engineering</p>
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-base text-neutral-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-base text-neutral-600">{footer}</div>}
        </div>
      </main>
      <aside className="hidden w-[45%] flex-col justify-end bg-accent-700 p-12 lg:flex" aria-hidden>
        <p className="text-lg font-semibold text-white">Mentora</p>
        <p className="mt-1 text-base text-white/80">Goa College of Engineering · Mentor–mentee scheme</p>
      </aside>
    </div>
  )
}
