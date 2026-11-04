import { GraduationCap } from 'lucide-react'

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[42%] max-w-xl flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold">Mentora</span>
        </div>
        <div>
          <p className="text-2xl font-semibold leading-snug">
            The institute mentorship scheme, run on records instead of reminders.
          </p>
          <dl className="mt-8 space-y-4 text-sm text-brand-100">
            <div>
              <dt className="font-medium text-white">Verified academics</dt>
              <dd>Students upload internals and results; mentors verify them.</dd>
            </div>
            <div>
              <dt className="font-medium text-white">Early warning</dt>
              <dd>Five fixed rules raise flags the moment a record is verified.</dd>
            </div>
            <div>
              <dt className="font-medium text-white">Documented follow-up</dt>
              <dd>Meetings, minutes and resolutions stay on file for review.</dd>
            </div>
          </dl>
        </div>
        <p className="text-xs text-brand-200">Goa College of Engineering · Mentor–mentee scheme</p>
      </aside>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-700 text-white">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-lg font-semibold text-slate-900">Mentora</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-slate-600">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
