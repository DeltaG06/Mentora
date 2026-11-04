import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, HOME_BY_ROLE, useAuth } from './auth/AuthContext'
import { AppLayout } from './components/layout/AppLayout'
import { SkeletonBlock } from './components/ui/Feedback'
import { ToastProvider } from './components/ui/Toast'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

const page = (loader) => lazy(loader)

const StudentDashboard = page(() => import('./pages/student/StudentDashboard'))
const InternalsPage = page(() => import('./pages/student/InternalsPage'))
const ResultsPage = page(() => import('./pages/student/ResultsPage'))
const StudentFlagsPage = page(() => import('./pages/student/StudentFlagsPage'))
const StudentMeetingsPage = page(() => import('./pages/student/StudentMeetingsPage'))
const StudentSessionsPage = page(() => import('./pages/student/StudentSessionsPage'))

const MentorDashboard = page(() => import('./pages/mentor/MentorDashboard'))
const VerificationPage = page(() => import('./pages/mentor/VerificationPage'))
const MenteeDetailPage = page(() => import('./pages/mentor/MenteeDetailPage'))
const MentorFlagsPage = page(() => import('./pages/mentor/MentorFlagsPage'))
const SlotsPage = page(() => import('./pages/mentor/SlotsPage'))
const MentorMeetingsPage = page(() => import('./pages/mentor/MentorMeetingsPage'))
const MentorSessionsPage = page(() => import('./pages/mentor/MentorSessionsPage'))

const AdminDashboard = page(() => import('./pages/admin/AdminDashboard'))
const ApprovalsPage = page(() => import('./pages/admin/ApprovalsPage'))
const UsersPage = page(() => import('./pages/admin/UsersPage'))
const AllocationsPage = page(() => import('./pages/admin/AllocationsPage'))
const SemestersPage = page(() => import('./pages/admin/SemestersPage'))
const AdminFlagsPage = page(() => import('./pages/admin/AdminFlagsPage'))

const FlagDetailPage = page(() => import('./pages/shared/FlagDetailPage'))
const NotificationsPage = page(() => import('./pages/shared/NotificationsPage'))
const ProfilePage = page(() => import('./pages/shared/ProfilePage'))
const NotFoundPage = page(() => import('./pages/shared/NotFoundPage'))

// The only progress indicator allowed: before the session is restored.
function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <span className="h-1 w-24 overflow-hidden rounded-full bg-neutral-200">
        <span className="block h-full w-1/3 animate-pulse rounded-full bg-accent-700" />
      </span>
    </div>
  )
}

/** Requires a signed-in user, optionally with one of `roles`. */
function RequireAuth({ roles }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />
  return <Outlet />
}

function PublicOnly({ children }) {
  const { ready } = useAuth()
  return ready ? children : <FullScreenSpinner />
}

function Home() {
  const { user } = useAuth()
  return <Navigate to={user ? HOME_BY_ROLE[user.role] : '/login'} replace />
}

function Lazy() {
  return (
    <Suspense fallback={<SkeletonBlock className="h-64" />}>
      <Outlet />
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />

            <Route element={<RequireAuth />}>
              <Route index element={<Home />} />
              <Route element={<AppLayout />}>
                <Route element={<Lazy />}>
                  <Route element={<RequireAuth roles={['student']} />}>
                    <Route path="student" element={<StudentDashboard />} />
                    <Route path="student/internals" element={<InternalsPage />} />
                    <Route path="student/results" element={<ResultsPage />} />
                    <Route path="student/flags" element={<StudentFlagsPage />} />
                    <Route path="student/flags/:flagId" element={<FlagDetailPage />} />
                    <Route path="student/meetings" element={<StudentMeetingsPage />} />
                    <Route path="student/sessions" element={<StudentSessionsPage />} />
                  </Route>

                  <Route element={<RequireAuth roles={['mentor']} />}>
                    <Route path="mentor" element={<MentorDashboard />} />
                    <Route path="mentor/verification" element={<VerificationPage />} />
                    <Route path="mentor/mentees/:studentId" element={<MenteeDetailPage />} />
                    <Route path="mentor/flags" element={<MentorFlagsPage />} />
                    <Route path="mentor/flags/:flagId" element={<FlagDetailPage />} />
                    <Route path="mentor/slots" element={<SlotsPage />} />
                    <Route path="mentor/meetings" element={<MentorMeetingsPage />} />
                    <Route path="mentor/sessions" element={<MentorSessionsPage />} />
                  </Route>

                  <Route element={<RequireAuth roles={['admin']} />}>
                    <Route path="admin" element={<AdminDashboard />} />
                    <Route path="admin/approvals" element={<ApprovalsPage />} />
                    <Route path="admin/users" element={<UsersPage />} />
                    <Route path="admin/allocations" element={<AllocationsPage />} />
                    <Route path="admin/semesters" element={<SemestersPage />} />
                    <Route path="admin/flags" element={<AdminFlagsPage />} />
                    <Route path="admin/flags/:flagId" element={<FlagDetailPage />} />
                  </Route>

                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
