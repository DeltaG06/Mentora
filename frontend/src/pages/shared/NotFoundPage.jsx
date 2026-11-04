import { Link } from 'react-router-dom'
import { HOME_BY_ROLE, useAuth } from '../../auth/AuthContext'

export default function NotFoundPage() {
  const { user } = useAuth()
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The page you were looking for does not exist or has moved.</p>
      <Link to={user ? HOME_BY_ROLE[user.role] : '/login'} className="mt-6 inline-block text-sm link">
        Go to your dashboard
      </Link>
    </div>
  )
}
