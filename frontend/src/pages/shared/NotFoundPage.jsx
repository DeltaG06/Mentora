import { HOME_BY_ROLE, useAuth } from '../../auth/AuthContext'
import { LinkButton } from '../../components/ui/Button'

export default function NotFoundPage() {
  const { user } = useAuth()
  return (
    <div className="py-12">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="mt-1 text-base text-neutral-600">The page you were looking for does not exist or has moved.</p>
      <LinkButton to={user ? HOME_BY_ROLE[user.role] : '/login'} className="mt-5">
        Go to your dashboard
      </LinkButton>
    </div>
  )
}
