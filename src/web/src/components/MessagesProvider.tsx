import { Check, X } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { MessagesContext, type Messages } from './messages'
import { Modal } from './Modal'

interface Message {
  kind: 'success' | 'error'
  title: string
  text: string
}

export function MessagesProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<Message | null>(null)
  const acceptRef = useRef<HTMLButtonElement>(null)

  const messages = useMemo<Messages>(
    () => ({
      showSuccess: (text, title = 'Listo') => setMessage({ kind: 'success', title, text }),
      showError: (text, title = 'Hubo un problema') => setMessage({ kind: 'error', title, text }),
    }),
    [],
  )

  const close = () => setMessage(null)

  return (
    <MessagesContext.Provider value={messages}>
      {children}
      {message && (
        <Modal
          // A new message gets a new dialog, with focus back on its button.
          key={`${message.kind}:${message.title}:${message.text}`}
          title={message.title}
          message={message.text}
          tone={message.kind === 'success' ? 'success' : 'danger'}
          icon={message.kind === 'success' ? <Check size={44} /> : <X size={44} />}
          onEscape={close}
          initialFocus={acceptRef}
        >
          <Button ref={acceptRef} variant={message.kind === 'success' ? 'success' : 'danger'} onClick={close}>
            Aceptar
          </Button>
        </Modal>
      )}
    </MessagesContext.Provider>
  )
}
