import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { HOME_BY_ROLE, useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'
import { Input, Select } from '../../components/ui/Field'
import { DEPARTMENTS } from '../../lib/constants'
import { AuthShell } from './AuthShell'

const EMPTY = {
  name: '',
  email: '',
  password: '',
  phone: '',
  department: '',
  roll_no: '',
  year: '',
  division: '',
  designation: '',
}

function validate(role, form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Enter your full name.'
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.'
  if (form.password.length < 8) errors.password = 'Use at least 8 characters.'
  else if (form.password.length > 72) errors.password = 'Use at most 72 characters.'
  if (!form.department) errors.department = 'Choose your department.'
  if (role === 'student') {
    if (!form.roll_no.trim()) errors.roll_no = 'Enter your roll number.'
    if (!form.year) errors.year = 'Choose your year.'
    if (!form.division.trim()) errors.division = 'Enter your division.'
  } else if (!form.designation.trim()) {
    errors.designation = 'Enter your designation.'
  }
  return errors
}

export default function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState('student')
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [awaitingApproval, setAwaitingApproval] = useState(false)

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  const onSubmit = async (event) => {
    event.preventDefault()
    const found = validate(role, form)
    setErrors(found)
    setError(null)
    if (Object.keys(found).length) return

    const payload = {
      role,
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim() || null,
      department: form.department,
      ...(role === 'student'
        ? { roll_no: form.roll_no.trim(), year: Number(form.year), division: form.division.trim() }
        : { designation: form.designation.trim() }),
    }
    setSubmitting(true)
    try {
      const created = await register(payload)
      if (created.status === 'active') navigate(HOME_BY_ROLE[created.role], { replace: true })
      else setAwaitingApproval(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (awaitingApproval) {
    return (
      <AuthShell title="Registration received">
        <p className="text-base text-neutral-700">
          The mentor account for <span className="font-medium">{form.email.trim().toLowerCase()}</span> has been
          created and is waiting for approval by the scheme coordinator. You can sign in as soon as it is approved.
        </p>
        <Link to="/login" className="link mt-6 inline-block">
          Back to sign in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle="Students can sign in immediately. Mentor accounts need coordinator approval."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </>
      }
    >
      <div className="mb-6 grid grid-cols-2 rounded-md border border-neutral-300 p-0.5" role="radiogroup" aria-label="Account type">
        {['student', 'mentor'].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={role === value}
            onClick={() => {
              setRole(value)
              setErrors({})
            }}
            className={`h-10 rounded-sm text-base font-medium ${
              role === value ? 'bg-accent-700 text-white' : 'text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {value === 'student' ? 'Student' : 'Mentor'}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Full name" value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" required />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          autoComplete="email"
          required
        />
        <Input
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint="8 to 72 characters."
          autoComplete="new-password"
          required
        />
        <Select label="Department" value={form.department} onChange={set('department')} error={errors.department} required>
          <option value="">Select department</option>
          {DEPARTMENTS.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </Select>

        {role === 'student' ? (
          <>
            <Input
              label="Roll number"
              value={form.roll_no}
              onChange={set('roll_no')}
              error={errors.roll_no}
              placeholder="e.g. 23CE045"
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Select label="Year" value={form.year} onChange={set('year')} error={errors.year} required>
                <option value="">Select</option>
                {[1, 2, 3, 4].map((year) => (
                  <option key={year} value={year}>
                    Year {year}
                  </option>
                ))}
              </Select>
              <Input
                label="Division"
                value={form.division}
                onChange={set('division')}
                error={errors.division}
                maxLength={10}
                placeholder="e.g. A"
                required
              />
            </div>
          </>
        ) : (
          <Input
            label="Designation"
            value={form.designation}
            onChange={set('designation')}
            error={errors.designation}
            placeholder="e.g. Assistant Professor"
            required
          />
        )}
        <Input
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={set('phone')}
          maxLength={20}
          hint="Optional."
          autoComplete="tel"
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}
