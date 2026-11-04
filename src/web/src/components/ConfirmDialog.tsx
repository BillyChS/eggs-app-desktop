import { CircleHelp } from 'lucide-react'
import { useRef } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

interface Props {
  message: string
  /** Says what happens, for example "Sí, borrar". */
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  title?: string
  cancelLabel?: string
  danger?: boolean
}

/** Show it by rendering it. Focus starts on the safe choice, so a stray Enter never confirms. */
export function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  title = '¿Está seguro?',
  cancelLabel = 'No, cancelar',
  danger = false,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Modal
      title={title}
      message={message}
      tone={danger ? 'danger' : 'primary'}
      icon={<CircleHelp size={44} />}
      onEscape={onCancel}
      initialFocus={cancelRef}
    >
      <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </Modal>
  )
}
