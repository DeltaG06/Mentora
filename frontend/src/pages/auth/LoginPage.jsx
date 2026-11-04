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
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />

  const onSubmit = async (event) => {
    event.preventDefault()
    const found = {}
    if (!form.email.trim()) found.email = 'Enter your email address.'
    if (!form.password) found.password = 'Enter your password.'
    setErrors(found)
    setNotice(null)
    if (Object.keys(found).length) return

    setSubmitting(true)
    try {
      const signedIn = await login(form.email, form.password)
      const from = location.state?.from
      const home = HOME_BY_ROLE[signedIn.role]
      navigate(from && from.startsWith(home) ? from : home, { replace: true })
    } catch (err) {
      const status = err.response?.status
      const message = errorMessage(err)
      if (status === 401) setNotice({ tone: 'error', text: 'Incorrect email or password.' })
      else if (status === 403 && /pending/i.test(message)) {
        setNotice({ tone: 'warning', text: 'Your mentor account is waiting for approval by the scheme coordinator.' })
      } else if (status === 403) setNotice({ tone: 'error', text: 'This account has been deactivated.' })
      else setNotice({ tone: 'error', text: message })
    } finally {
      setSubmitting(false)
    }
  }

  const set = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    if (errors[field]) setErrors({ ...errors, [field]: undefined })
  }

  return (
    <AuthShell
      title="Sign in"
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
        {params.get('expired') && !notice && <Alert tone="info">Your session has ended. Please sign in again.</Alert>}
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}
