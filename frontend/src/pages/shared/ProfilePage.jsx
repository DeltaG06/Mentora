import { useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Alert } from '../../components/ui/Feedback'
import { Input } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import { formatDate } from '../../lib/format'

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value || '—'}</dd>
    </div>
  )
}

function ProfileForm() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const changed = form.name.trim() !== user.name || (form.phone.trim() || null) !== (user.phone || null)

  const submit = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('Name cannot be empty.')
      return
    }
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
    <Card title="Contact details" description="Your name and phone number are visible to your mentor or mentees.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} required />
        <Input label="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} />
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!changed}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PasswordForm() {
  const toast = useToast()
  const [form, setForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (form.new_password.length < 8 || form.new_password.length > 72) {
      setError('The new password must be 8 to 72 characters.')
      return
    }
    if (form.new_password !== form.confirm) {
      setError('The new passwords do not match.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.patch('/users/me/password', { old_password: form.old_password, new_password: form.new_password })
      setForm({ old_password: '', new_password: '', confirm: '' })
      toast.success('Password changed.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  return (
    <Card title="Password">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Current password" type="password" autoComplete="current-password" value={form.old_password} onChange={set('old_password')} required />
        <Input label="New password" type="password" autoComplete="new-password" value={form.new_password} onChange={set('new_password')} hint="8 to 72 characters." required />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!form.old_password || !form.new_password || !form.confirm}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()
  return (
    <>
      <PageHeader title="Profile" description="Your account details." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Account" className="lg:col-span-1">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Detail label="Email" value={user.email} />
            <Detail label="Role" value={user.role.charAt(0).toUpperCase() + user.role.slice(1)} />
            <Detail label="Department" value={user.department} />
            {user.role === 'student' && (
              <>
                <Detail label="Roll number" value={user.roll_no} />
                <Detail label="Year and division" value={`Year ${user.year}, Division ${user.division}`} />
              </>
            )}
            {user.role === 'mentor' && <Detail label="Designation" value={user.designation} />}
            <Detail label="Member since" value={formatDate(user.created_at)} />
          </dl>
          {user.role === 'student' && (
            <p className="mt-4 text-xs text-slate-500">
              Year and division are maintained by the scheme coordinator.
            </p>
          )}
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <ProfileForm />
          <PasswordForm />
        </div>
      </div>
    </>
  )
}
