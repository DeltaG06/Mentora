import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { HOME_BY_ROLE, useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'
import { Input } from '../../components/ui/Field'
import { AuthShell } from './AuthShell'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />

  const onSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setPending(false)
    setSubmitting(true)
    try {
      const signedIn = await login(form.email, form.password)
      const from = location.state?.from
      const home = HOME_BY_ROLE[signedIn.role]
      navigate(from && from.startsWith(home) ? from : home, { replace: true })
    } catch (err) {
      const message = errorMessage(err)
      if (err.response?.status === 403 && /pending/i.test(message)) setPending(true)
      else setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the email address you registered with."
      footer={
        <>
          New to Mentora?{' '}
          <Link to="/register" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {params.get('expired') && !error && !pending && (
          <Alert tone="info">Your session has ended. Please sign in again.</Alert>
        )}
        {pending && (
          <Alert tone="warning" title="Awaiting approval">
            Your mentor account has not been approved yet. You will be able to sign in once the
            scheme coordinator approves it.
          </Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <Button
          type="submit"
          className="w-full"
          loading={submitting}
          disabled={!form.email || !form.password}
        >
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}
