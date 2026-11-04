import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Flag,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCheck,
  UserCog,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { initials } from '../../lib/format'
import { NotificationBell } from './NotificationBell'

const NAV = {
  student: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/internals', label: 'Internal marks', icon: ClipboardCheck },
    { to: '/student/results', label: 'Semester results', icon: FileText },
    { to: '/student/flags', label: 'My flags', icon: Flag },
    { to: '/student/meetings', label: 'Meetings', icon: CalendarClock },
    { to: '/student/sessions', label: 'Group sessions', icon: UsersRound },
  ],
  mentor: [
    { to: '/mentor', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/mentor/verification', label: 'Verification', icon: BookOpenCheck },
    { to: '/mentor/flags', label: 'Flags', icon: Flag },
    { to: '/mentor/slots', label: 'Slots', icon: CalendarDays },
    { to: '/mentor/meetings', label: 'Meetings', icon: CalendarClock },
    { to: '/mentor/sessions', label: 'Group sessions', icon: UsersRound },
  ],
  admin: [
    { to: '/admin', label: 'Compliance', icon: BarChart3, end: true },
    { to: '/admin/approvals', label: 'Approvals', icon: UserCheck },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/allocations', label: 'Allocations', icon: UserCog },
    { to: '/admin/semesters', label: 'Semesters', icon: CalendarDays },
    { to: '/admin/flags', label: 'Flags', icon: Flag },
  ],
}

const ROLE_LABEL = { student: 'Student', mentor: 'Mentor', admin: 'Administrator' }

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-white">
        <GraduationCap className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold text-slate-900">Mentora</span>
        <span className="block text-[11px] text-slate-500">Goa College of Engineering</span>
      </span>
    </Link>
  )
}

function NavItems({ items }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors md:h-10 ${
              isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-brand-700' : 'text-slate-400'}`} aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return undefined
    const onClick = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2 rounded-md pl-1 pr-2 hover:bg-slate-100"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
          {initials(user.name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-slate-800">{user.name}</span>
          <span className="block text-[11px] text-slate-500">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link to="/profile" className="flex h-10 items-center px-3 text-sm text-slate-700 hover:bg-slate-50">
            Profile and password
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex h-10 w-full items-center gap-2 px-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4 text-slate-400" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const items = NAV[user.role]

  useEffect(() => setDrawer(false), [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto">
          <NavItems items={items} />
        </div>
        <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
          Signed in as {ROLE_LABEL[user.role].toLowerCase()}
          {user.department && <span className="block truncate">{user.department} department</span>}
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 flex-1 overflow-y-auto">
              <NavItems items={items} />
            </div>
          </aside>
        </div>
      )}

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="md:hidden">
              <Brand />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserMenu user={user} onLogout={handleLogout} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
