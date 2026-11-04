import { useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { Detail, Panel } from '../../components/ui/Card'
import { Alert } from '../../components/ui/Feedback'
import { Input } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import { formatDate } from '../../lib/format'

function ProfileForm() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '' })
  const [nameError, setNameError] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const changed = form.name.trim() !== user.name || (form.phone.trim() || null) !== (user.phone || null)

  const submit = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) return setNameError('Enter your name.')
    setSaving(true)
    setError(null)
    try {
      const { data } = await api.patch('/users/me', { name: form.name.trim(), phone: form.phone.trim() || null })
      setUser(data)
      toast.success('Profile updated.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="Contact details" description="Your name and phone number are visible to your mentor or mentees.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Full name"
          value={form.name}
          onChange={(e) => {
            setForm({ ...form, name: e.target.value })
            setNameError(null)
          }}
          error={nameError}
          maxLength={120}
          required
        />
        <Input label="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} hint="Optional." />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!changed}>
            Save changes
          </Button>
        </div>
      </form>
    </Panel>
  )
}

const EMPTY_PASSWORDS = { old_password: '', new_password: '', confirm: '' }

function PasswordForm() {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY_PASSWORDS)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const found = {}
    if (!form.old_password) found.old_password = 'Enter your current password.'
    if (form.new_password.length < 8 || form.new_password.length > 72) found.new_password = 'Use 8 to 72 characters.'
    if (form.confirm !== form.new_password) found.confirm = 'The new passwords do not match.'
    setErrors(found)
    setError(null)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      await api.patch('/users/me/password', { old_password: form.old_password, new_password: form.new_password })
      setForm(EMPTY_PASSWORDS)
      toast.success('Password changed.')
    } catch (err) {
      if (err.response?.status === 400) setErrors({ old_password: 'The current password is incorrect.' })
      else setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const set = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    if (errors[field]) setErrors({ ...errors, [field]: undefined })
  }

  return (
    <Panel title="Password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={form.old_password}
          onChange={set('old_password')}
          error={errors.old_password}
          required
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={form.new_password}
          onChange={set('new_password')}
          error={errors.new_password}
          hint="8 to 72 characters."
          required
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
          required
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()
  return (
    <>
      <PageHeader title="Profile" description="Your account details." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Account" className="lg:col-span-1">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Detail label="Email">{user.email}</Detail>
            <Detail label="Role">{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</Detail>
            <Detail label="Department">{user.department}</Detail>
            {user.role === 'student' && (
              <>
                <Detail label="Roll number">
                  <span className="font-mono text-sm">{user.roll_no}</span>
                </Detail>
                <Detail label="Year and division">{`Year ${user.year}, Division ${user.division}`}</Detail>
              </>
            )}
            {user.role === 'mentor' && <Detail label="Designation">{user.designation}</Detail>}
            <Detail label="Member since">{formatDate(user.created_at)}</Detail>
          </dl>
          {user.role === 'student' && (
            <p className="mt-4 text-xs text-neutral-500">Year and division are maintained by the scheme coordinator.</p>
          )}
        </Panel>
        <div className="space-y-6 lg:col-span-2">
          <ProfileForm />
          <PasswordForm />
        </div>
      </div>
    </>
  )
}
