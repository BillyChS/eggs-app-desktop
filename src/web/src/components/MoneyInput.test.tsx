import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MoneyInput } from './MoneyInput'

function setup(initial: number | null = null) {
  const seen = { value: initial }

  function Form() {
    const [value, setValue] = useState(initial)
    const update = (next: number | null) => {
      seen.value = next
      setValue(next)
    }

    return (
      <>
        <MoneyInput label="Monto" value={value} onChange={update} />
        <button onClick={() => update(null)}>Limpiar</button>
      </>
    )
  }

  render(<Form />)
  return { seen, input: screen.getByLabelText<HTMLInputElement>('Monto'), user: userEvent.setup() }
}

describe('MoneyInput', () => {
  it('formats while typing and reports whole colones', async () => {
    const { seen, input, user } = setup()

    await user.type(input, '12500')

    expect(input.value).toBe('12.500')
    expect(seen.value).toBe(12500)
  })

  it('shows an initial value formatted', () => {
    expect(setup(1250000).input.value).toBe('1.250.000')
  })

  it('ignores letters', async () => {
    const { seen, input, user } = setup()

    await user.type(input, '1e2a')

    expect(input.value).toBe('12')
    expect(seen.value).toBe(12)
  })

  it('reports null when emptied', async () => {
    const { seen, input, user } = setup(500)

    await user.clear(input)

    expect(input.value).toBe('')
    expect(seen.value).toBeNull()
  })

  it('keeps the caret after the same digit when formatting changes the text', async () => {
    const { seen, input, user } = setup(1250)

    // "1.250" with the caret after the 1, then a 9.
    await user.click(input)
    input.setSelectionRange(1, 1)
    await user.keyboard('9')

    expect(input.value).toBe('19.250')
    expect(seen.value).toBe(19250)
    expect(input.selectionStart).toBe(2)
  })

  it('accepts thousands typed by hand', async () => {
    const { seen, input, user } = setup()

    await user.type(input, '12.500')
    await user.tab()

    expect(input.value).toBe('12.500')
    expect(seen.value).toBe(12500)
    expect(screen.queryByText(/céntimos/)).toBeNull()
  })

  it('refuses typed céntimos instead of inflating the amount', async () => {
    const { seen, input, user } = setup()

    await user.type(input, '12500,50')
    await user.tab()

    expect(seen.value).toBeNull()
    expect(input.value).toBe('12.500,50')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Escriba solo colones enteros, sin céntimos.')).toBeTruthy()
  })

  it('refuses céntimos typed after a formatted amount', async () => {
    const { seen, input, user } = setup()

    await user.type(input, '12500.5')
    await user.tab()

    expect(seen.value).toBeNull()
    expect(screen.getByText('Escriba solo colones enteros, sin céntimos.')).toBeTruthy()
  })

  it('goes back to formatting once the mistake is deleted', async () => {
    const { seen, input, user } = setup()

    await user.type(input, '125,5{Backspace}{Backspace}00')

    expect(input.value).toBe('12.500')
    expect(seen.value).toBe(12500)
  })

  it('reads a pasted amount as a whole', async () => {
    const { seen, input, user } = setup()

    await user.click(input)
    await user.paste('₡12.500')

    expect(input.value).toBe('12.500')
    expect(seen.value).toBe(12500)
  })

  it('refuses pasted céntimos and leaves the value alone', async () => {
    const { seen, input, user } = setup(700)

    await user.click(input)
    await user.paste('12500,50')

    expect(input.value).toBe('700')
    expect(seen.value).toBe(700)
    expect(screen.getByText('Escriba solo colones enteros, sin céntimos.')).toBeTruthy()
  })

  it('stops at the maximum digits', async () => {
    const { seen, input, user } = setup()

    await user.type(input, '1234567890123')

    expect(seen.value).toBe(123456789012)
  })

  it('formats again as soon as a typed separator is deleted', async () => {
    const { input, user } = setup()

    await user.type(input, '1250.{Backspace}')

    expect(input.value).toBe('1.250')
  })

  it('follows a value cleared by its parent, along with any error', async () => {
    const { seen, input, user } = setup()

    await user.type(input, '125,5')
    await user.tab()
    expect(screen.getByText(/céntimos/)).toBeTruthy()

    // Still null from the mistake, so the parent has nothing to change: the text and the error stay for correcting.
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(input.value).toBe('125,5')

    await user.clear(input)
    await user.type(input, '700')
    expect(seen.value).toBe(700)

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))

    expect(input.value).toBe('')
    expect(screen.queryByText(/céntimos/)).toBeNull()
  })
})
