import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dropdown } from './Dropdown'

const OPTIONS = [
  { value: 'cash', label: 'Al contado' },
  { value: 'credit', label: 'Fiado' },
  { value: 'other', label: 'Otro' },
] as const

type Value = (typeof OPTIONS)[number]['value']

function Harness({ start = null, onChange = () => {} }: { start?: Value | null; onChange?: (value: Value) => void }) {
  const [value, setValue] = useState<Value | null>(start)

  return (
    <>
      <Dropdown
        label="¿Cómo pagó?"
        value={value}
        options={[...OPTIONS]}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
      <button type="button">Afuera</button>
    </>
  )
}

const toggle = () => screen.getByRole('button', { name: /¿Cómo pagó?/ })
const list = () => screen.queryByRole('listbox')
const options = () => screen.getAllByRole('option')
const active = () => list()!.getAttribute('aria-activedescendant')

describe('Dropdown', () => {
  it('shows "Elija uno" until something is chosen, with the label in its name', () => {
    render(<Harness />)

    expect(toggle().textContent).toBe('Elija uno')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(list()).toBeNull()
  })

  it('a click opens it with every option, and the chosen one marked', async () => {
    const user = userEvent.setup()
    render(<Harness start="credit" />)

    await user.click(toggle())

    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(options().map((option) => option.textContent)).toEqual(['Al contado', 'Fiado', 'Otro'])
    expect(options().map((option) => option.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(options()[1].querySelector('svg')).toBeTruthy()
    // It opens on what's chosen, ready for the arrows.
    expect(active()).toBe(options()[1].id)
  })

  it('a click on an option picks it, closes, and puts focus back on the button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(toggle())
    await user.click(screen.getByRole('option', { name: 'Fiado' }))

    expect(onChange).toHaveBeenCalledWith('credit')
    expect(list()).toBeNull()
    expect(toggle().textContent).toBe('Fiado')
    expect(document.activeElement).toBe(toggle())
  })

  it.each(['{Enter}', ' ', '{ArrowDown}', '{ArrowUp}'])('%s on the button opens it', async (key) => {
    const user = userEvent.setup()
    render(<Harness />)
    toggle().focus()

    await user.keyboard(key)

    expect(list()).toBeTruthy()
    expect(document.activeElement).toBe(list())
    expect(active()).toBe(options()[0].id)
  })

  it('the arrows, Home and End move, stopping at the ends, and Enter picks', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    toggle().focus()

    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowUp}')
    expect(active()).toBe(options()[0].id)

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(active()).toBe(options()[2].id)

    await user.keyboard('{Home}')
    expect(active()).toBe(options()[0].id)

    await user.keyboard('{End}{ArrowUp}')
    expect(active()).toBe(options()[1].id)

    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledExactlyOnceWith('credit')
    expect(list()).toBeNull()
    expect(document.activeElement).toBe(toggle())
  })

  it('Space picks too', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    toggle().focus()

    await user.keyboard('{Enter}{ArrowDown} ')

    expect(onChange).toHaveBeenCalledWith('credit')
  })

  it('Esc closes without picking, and focus goes back to the button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness start="cash" onChange={onChange} />)
    toggle().focus()

    await user.keyboard('{Enter}{ArrowDown}{Escape}')

    expect(list()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(toggle().textContent).toBe('Al contado')
    expect(document.activeElement).toBe(toggle())
  })

  it('a click outside closes it without picking', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(toggle())
    await user.click(screen.getByRole('button', { name: 'Afuera' }))

    expect(list()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a click on the button again closes it', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(toggle())
    await user.click(toggle())

    expect(list()).toBeNull()
  })

  it('a held-down Enter opens it but never picks in the same press', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    toggle().focus()

    await user.keyboard('{Enter>3/}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows an error in words, and tells screen readers about it', () => {
    render(<Dropdown label="¿Cómo pagó?" value={null} options={[...OPTIONS]} onChange={() => {}} error="Escoja uno." />)

    expect(screen.getByRole('alert').textContent).toBe('Escoja uno.')
    expect(toggle().getAttribute('aria-invalid')).toBe('true')
  })
})
