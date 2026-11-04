import { useState } from 'react'
import { errorMessage } from '../../api/client'
import { Button } from './Button'
import { Alert } from './Feedback'
import { Modal } from './Modal'

/**
 * Confirmation dialog. `onConfirm` may be async; its error is shown inline
 * and the dialog stays open.
 */
export function ConfirmModal({ open, title, children, confirmLabel = 'Confirm', tone = 'primary', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      setBusy(false)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Back
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        {error && <Alert tone="error">{error}</Alert>}
        {children}
      </div>
    </Modal>
  )
}
