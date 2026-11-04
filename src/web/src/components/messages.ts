import { createContext, useContext } from 'react'

export interface Messages {
  showSuccess: (message: string, title?: string) => void
  showError: (message: string, title?: string) => void
}

export const MessagesContext = createContext<Messages | null>(null)

/** Success and error messages that stay until the user presses Aceptar, even if the screen behind them changes. */
export function useMessages(): Messages {
  const messages = useContext(MessagesContext)
  if (!messages) {
    throw new Error('useMessages must be used inside MessagesProvider.')
  }
  return messages
}
