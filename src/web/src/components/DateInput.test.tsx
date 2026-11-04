import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DateInput } from './DateInput'

describe('DateInput', () => {
  it('starts on the local today, in the evening too, and reports it', () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T20:00:00-06:00'), toFake: ['Date'] })
    const reported = vi.fn()

    function Form() {
      const [date, setDate] = useState<string>()
      const update = (next: string) => {
        reported(next)
        setDate(next)
      }
      return <DateInput label="Fecha" value={date} onChange={update} />
    }

    render(<Form />)

    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toBe('2026-11-04')
    expect(reported).toHaveBeenLastCalledWith('2026-11-04')
    expect(screen.getByText('miércoles, 4 de noviembre de 2026')).toBeTruthy()
  })

  it('shows the value it is given', () => {
    render(<DateInput label="Fecha" value="2026-01-05" onChange={() => {}} />)

    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toBe('2026-01-05')
    expect(screen.getByText('lunes, 5 de enero de 2026')).toBeTruthy()
  })

  it('shows no written date when the field is empty', () => {
    render(<DateInput label="Fecha" value="" onChange={() => {}} />)

    expect(screen.queryByText(/ de 20/)).toBeNull()
  })
})
