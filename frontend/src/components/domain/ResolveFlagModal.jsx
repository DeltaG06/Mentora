import { useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { FlagLine } from '../ui/Status'
import { useToast } from '../ui/Toast'

/** Resolve one flag with a mandatory note. Calls onResolved(updatedFlag). */
export function ResolveFlagModal({ flag, onClose, onResolved }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [current, setCurrent] = useState(null)

  if (flag !== current) {
    setCurrent(flag)
    setNote('')
    setError(null)
  }

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
      toast.success(`${data.rule} for ${data.student.name} resolved.`)
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
        <form id="resolve-flag-form" onSubmit={submit} className="space-y-4" noValidate>
          <div className="rounded-md border border-neutral-200 px-3 py-2.5">
            <FlagLine flag={flag} />
          </div>
          <Textarea
            label="Resolution note"
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              if (error) setError(null)
            }}
            error={error}
            placeholder="What was agreed with the student, and what happens next."
            hint="Kept on record and shared with the student."
            required
          />
        </form>
      )}
    </Modal>
  )
}
