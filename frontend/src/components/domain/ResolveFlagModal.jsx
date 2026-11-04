import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { Button } from '../ui/Button'
import { Alert } from '../ui/Feedback'
import { Textarea } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { RuleBadge } from '../ui/Badge'
import { useToast } from '../ui/Toast'

/** Resolve one flag with a mandatory note. Calls onResolved(updatedFlag). */
export function ResolveFlagModal({ flag, onClose, onResolved }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNote('')
    setError(null)
  }, [flag?.id])

  const submit = async (event) => {
    event.preventDefault()
    if (!note.trim()) {
      setError('A resolution note is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { data } = await api.post(`/flags/${flag.id}/resolve`, { resolution_note: note.trim() })
      toast.success(`Flag ${data.rule} for ${data.student.name} resolved.`)
      onResolved?.(data)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(flag)}
      onClose={onClose}
      title="Resolve flag"
      description={flag ? `${flag.student.name} · ${flag.semester.label}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="resolve-flag-form" loading={saving}>
            Resolve flag
          </Button>
        </>
      }
    >
      {flag && (
        <form id="resolve-flag-form" onSubmit={submit} className="space-y-4">
          <div className="flex items-start gap-3 rounded-md bg-slate-50 p-3">
            <RuleBadge rule={flag.rule} />
            <p className="text-sm text-slate-700">{flag.reason}</p>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Textarea
            label="Resolution note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was agreed with the student, and what happens next."
            hint="Kept on record and shared with the student."
            required
          />
        </form>
      )}
    </Modal>
  )
}
