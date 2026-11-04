import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { useMessages } from './messages'
import { MessagesProvider } from './MessagesProvider'

describe('Button', () => {
  it.each(['{Enter}', ' '])('responds to the key %j', async (key) => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Guardar</Button>)

    screen.getByRole('button', { name: 'Guardar' }).focus()
    await user.keyboard(key)

    expect(onClick).toHaveBeenCalledOnce()
  })

  it("doesn't submit a form unless asked to", () => {
    render(<Button>Guardar</Button>)

    expect(screen.getByRole<HTMLButtonElement>('button').type).toBe('button')
  })
})

describe('ConfirmDialog', () => {
  function setup() {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog danger message="Se va a borrar." confirmLabel="Sí, borrar" onConfirm={onConfirm} onCancel={onCancel} />)
    return { onConfirm, onCancel, user: userEvent.setup() }
  }

  it('asks in plain words', () => {
    setup()

    expect(screen.getByRole('alertdialog', { name: '¿Está seguro?', description: 'Se va a borrar.' })).toBeTruthy()
  })

  it('starts on the safe choice, so a stray Enter cancels', async () => {
    const { onConfirm, onCancel, user } = setup()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'No, cancelar' }))

    await user.keyboard('{Enter}')

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms only from its own button', async () => {
    const { onConfirm, onCancel, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Sí, borrar' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('treats Esc as cancel', () => {
    const { onConfirm, onCancel } = setup()

    screen.getByRole('alertdialog').dispatchEvent(new Event('cancel', { cancelable: true }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('messages', () => {
  function Sender() {
    const { showSuccess, showError } = useMessages()
    return (
      <>
        <Button onClick={() => showSuccess('La venta se guardó.')}>Éxito</Button>
        <Button onClick={() => showError('La venta no se guardó.')}>Error</Button>
      </>
    )
  }

  function setup() {
    render(
      <MessagesProvider>
        <Sender />
      </MessagesProvider>,
    )
    return userEvent.setup()
  }

  it.each([
    ['Éxito', 'Listo', 'La venta se guardó.'],
    ['Error', 'Hubo un problema', 'La venta no se guardó.'],
  ])('%s stays until Aceptar is pressed', async (trigger, title, text) => {
    const user = setup()

    await user.click(screen.getByRole('button', { name: trigger }))

    const dialog = screen.getByRole('alertdialog', { name: title, description: text })
    expect(dialog).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Aceptar' }))

    await user.keyboard('{Enter}')

    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('a stray click on the dialog leaves Enter working', async () => {
    const user = setup()

    await user.click(screen.getByRole('button', { name: 'Éxito' }))
    await user.click(screen.getByRole('alertdialog'))

    expect(screen.getByRole('alertdialog')).toBeTruthy()

    await user.keyboard('{Enter}')

    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('refuses to be used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Sender />)).toThrow('MessagesProvider')

    vi.restoreAllMocks()
  })
})
