import { useEffect, useRef, useState } from 'react'
import { Link, matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  FileText,
  Flag,
  LayoutDashboard,
  Menu,
  UserCheck,
  UserCog,
  Users,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { BreadcrumbProvider, useBreadcrumbDetail } from '../../lib/breadcrumb'
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
    { to: '/mentor', label: 'Mentees', icon: LayoutDashboard, end: true },
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

// Pages outside the nav that still need a breadcrumb.
const EXTRA = [
  { path: '/mentor/mentees/:id', section: '/mentor' },
  { path: '/notifications', label: 'Notifications' },
  { path: '/profile', label: 'Profile' },
]

const ROLE_LABEL = { student: 'Student', mentor: 'Mentor', admin: 'Administrator' }
const COLLAPSE_KEY = 'mentora.sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function Wordmark({ compact = false }) {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-700 text-sm font-semibold text-white">
        M
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block text-md font-semibold text-neutral-900">Mentora</span>
          <span className="block truncate text-xs text-neutral-500">Goa College of Engineering</span>
        </span>
      )}
    </Link>
  )
}

function NavItems({ items, collapsed }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={collapsed ? label : undefined}
          aria-label={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex h-11 items-center gap-3 rounded-md px-3 text-base font-medium md:h-9 ${collapsed ? 'justify-center px-0' : ''} ${
              isActive ? 'bg-accent-50 text-accent-700' : 'text-neutral-700 hover:bg-neutral-50'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent-700' : 'text-neutral-500'}`} aria-hidden />
              {!collapsed && label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function Breadcrumb({ items }) {
  const { pathname } = useLocation()
  const detail = useBreadcrumbDetail()

  const extra = EXTRA.find((e) => matchPath(e.path, pathname))
  const section =
    items.find((item) => item.to === (extra?.section || pathname)) ||
    [...items].sort((a, b) => b.to.length - a.to.length).find((item) => !item.end && pathname.startsWith(`${item.to}/`))

  const parts = []
  if (section) parts.push({ label: section.label, to: section.to })
  else if (extra?.label) parts.push({ label: extra.label })
  if (section && pathname !== section.to) parts.push({ label: detail || 'Details' })

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-neutral-500">
        {parts.map((part, i) => {
          const last = i === parts.length - 1
          return (
            <li key={part.label} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {last || !part.to ? (
                <span className={`truncate ${last ? 'text-neutral-800' : ''}`} aria-current={last ? 'page' : undefined}>
                  {part.label}
                </span>
              ) : (
                <Link to={part.to} className="truncate hover:text-neutral-800">
                  {part.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
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

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2 rounded-md px-2 text-left hover:bg-neutral-50"
        aria-expanded={open}
      >
        <span className="leading-tight">
          <span className="block max-w-[9rem] truncate text-sm font-medium text-neutral-800">{user.name}</span>
          <span className="hidden text-xs text-neutral-500 sm:block">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-neutral-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-60 animate-enter rounded-md border border-neutral-200 bg-neutral-0 py-1 shadow-overlay">
          <div className="border-b border-neutral-200 px-3 py-2">
            <p className="truncate text-sm font-medium text-neutral-900">{user.name}</p>
            <p className="truncate text-xs text-neutral-500">{user.email}</p>
          </div>
          <Link to="/profile" className="flex h-10 items-center px-3 text-sm text-neutral-700 hover:bg-neutral-50">
            Profile and password
          </Link>
          <button type="button" onClick={onLogout} className="flex h-10 w-full items-center px-3 text-sm text-neutral-700 hover:bg-neutral-50">
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function Shell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const items = NAV[user.role]

  useEffect(() => setDrawer(false), [location.pathname])

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1')
      } catch {
        // Not persisted; the choice lasts for this page load.
      }
      return !value
    })
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-neutral-200 bg-neutral-0 md:flex ${
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
        }`}
      >
        <div className={`flex h-14 items-center border-b border-neutral-200 ${collapsed ? 'justify-center' : 'px-4'}`}>
          <Wordmark compact={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <NavItems items={items} collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`flex h-11 items-center gap-2 border-t border-neutral-200 text-sm text-neutral-500 hover:text-neutral-900 ${
            collapsed ? 'justify-center' : 'px-5'
          }`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <ChevronsLeft className="h-4 w-4" aria-hidden />}
          {!collapsed && 'Collapse'}
        </button>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-[rgba(28,25,23,0.4)]" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-enter flex-col border-r border-neutral-200 bg-neutral-0">
            <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-4">
              <Wordmark />
              <button type="button" onClick={() => setDrawer(false)} className="h-11 text-sm font-medium text-neutral-500">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3">
              <NavItems items={items} />
            </div>
          </aside>
        </div>
      )}

      <div className={collapsed ? 'md:pl-sidebar-collapsed' : 'md:pl-sidebar'}>
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-0 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="flex h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-neutral-700 md:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden />
              Menu
            </button>
            <Breadcrumb items={items} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <UserMenu user={user} onLogout={handleLogout} />
          </div>
        </header>
        <main key={location.pathname} className="w-full max-w-content animate-enter px-4 py-6 md:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function AppLayout() {
  return (
    <BreadcrumbProvider>
      <Shell />
    </BreadcrumbProvider>
  )
}
