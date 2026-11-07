import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { todayLocal } from '../../lib/dates'
import { routes } from '../../routes'

const TODAY = todayLocal()

/** Worked out here, apart from the screen's own code: the Monday on or before today. */
function mondayOfThisWeek() {
  const now = new Date()
  return todayLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)))
}

const FIRST_OF_MONTH = `${TODAY.slice(0, 8)}01`

const OCTOBER = {
  from: '2026-10-01',
  to: '2026-10-31',
  cameIn: { cash: 352000, payments: 60000, total: 412000 },
  spent: {
    total: 436500,
    byCategory: [
      { name: 'Alimento', total: 310000 },
      { name: 'Cartones', total: 62500 },
      { name: 'Vitaminas', total: 34000 },
      { name: 'Otro', total: 30000 },
    ],
  },
  net: -24500,
  creditSold: 48000,
  owedTotal: 96500,
  cartons: [
    { cartonType: 'A', quantity: 120 },
    { cartonType: 'B', quantity: 1 },
  ],
  days: [
    { date: '2026-10-05', cameIn: 52000, spent: 31000, net: 21000 },
    { date: '2026-10-06', cameIn: 18000, spent: 20000, net: -2000 },
  ],
  // 352.000 cash + 48.000 fiado = 400.000: 100.500 + 30.000 + 1.500 named, 268.000 to nobody.
  bestCustomers: {
    top: [
      { id: 'c1', name: 'Doña Rosa', isDeleted: false, fifteens: 40, thirties: 1, total: 100500 },
      { id: 'c2', name: 'Don Luis', isDeleted: true, fifteens: 12, thirties: 0, total: 30000 },
    ],
    othersCount: 1,
    othersTotal: 1500,
    withoutCustomer: 268000,
  },
}

const NOBODY_NAMED = { top: [], othersCount: 0, othersTotal: 0, withoutCustomer: 0 }

const EMPTY = {
  from: TODAY,
  to: TODAY,
  cameIn: { cash: 0, payments: 0, total: 0 },
  spent: { total: 0, byCategory: [] },
  net: 0,
  creditSold: 0,
  owedTotal: 8000,
  cartons: [],
  days: [],
  bestCustomers: NOBODY_NAMED,
}

interface Call {
  url: URL
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const calls: Call[] = []
let summaryReply: (url: URL) => Response

const fetchMock = vi.fn<typeof fetch>(async (input) => {
  const url = new URL(String(input), 'http://app')
  calls.push({ url })

  if (url.pathname === '/api/reports/summary') {
    return summaryReply(url)
  }

  return json({ status: 'ok', time: '2026-11-04T10:00:00' })
})

const summaryCalls = () =>
  calls
    .filter((call) => call.url.pathname === '/api/reports/summary')
    .map((call) => `${call.url.searchParams.get('from')}..${call.url.searchParams.get('to')}`)

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const big = (label: string) => screen.getByText(label, { selector: 'p > span' }).parentElement!
const section = (name: string) => screen.getByRole('region', { name })
const lines = (name: string) =>
  within(section(name))
    .getAllByRole('paragraph')
    .map((line) => line.textContent)

beforeEach(() => {
  calls.length = 0
  summaryReply = (url) =>
    url.searchParams.get('from') === '2026-10-01' ? json(OCTOBER) : json({ ...EMPTY, from: url.searchParams.get('from') })
  vi.stubGlobal('fetch', fetchMock)
})

describe('Resúmenes', () => {
  it('opens on this month, from its first day to today', async () => {
    open('/resumenes')

    await screen.findByText('No hubo ventas, abonos ni gastos en este período.')
    expect(summaryCalls()).toEqual([`${FIRST_OF_MONTH}..${TODAY}`])
    expect(button('Este mes').getAttribute('aria-pressed')).toBe('true')
    expect(button('Siguiente')).toHaveProperty('disabled', true)
  })

  it('switches between Hoy, Esta semana and Este mes, with weeks from Monday', async () => {
    const { router, user } = open('/resumenes')
    await screen.findByText('No hubo ventas, abonos ni gastos en este período.')

    await user.click(button('Hoy'))
    await screen.findByText('No hubo ventas, abonos ni gastos en este período.')
    expect(button('Hoy').getAttribute('aria-pressed')).toBe('true')
    expect(router.state.location.search).toBe(`?periodo=dia&desde=${TODAY}`)

    await user.click(button('Esta semana'))
    await screen.findByText('No hubo ventas, abonos ni gastos en este período.')
    expect(button('Esta semana').getAttribute('aria-pressed')).toBe('true')
    expect(button('Hoy').getAttribute('aria-pressed')).toBe('false')

    expect(summaryCalls()).toEqual([
      `${FIRST_OF_MONTH}..${TODAY}`,
      `${TODAY}..${TODAY}`,
      `${mondayOfThisWeek()}..${TODAY}`,
    ])
  })

  it('shows the three big numbers first, with a negative Quedó in red words and a minus sign', async () => {
    open('/resumenes?periodo=mes&desde=2026-10-01')

    await screen.findByText('octubre de 2026')
    expect(await screen.findByText('₡412.000')).toBeTruthy()
    expect(big('Entró').textContent).toBe('Entró₡412.000')
    expect(big('Gastado').textContent).toBe('Gastado₡436.500')
    expect(big('Quedó').textContent).toBe('Quedó−₡24.500Se gastó más de lo que entró.')
    expect(summaryCalls()).toEqual(['2026-10-01..2026-10-31'])
  })

  it('a positive Quedó has no warning', async () => {
    summaryReply = () => json({ ...OCTOBER, net: 5000 })
    open('/resumenes?periodo=mes&desde=2026-10-01')

    expect((await screen.findByText('₡5.000')).closest('p')!.textContent).toBe('Quedó₡5.000')
    expect(screen.queryByText('Se gastó más de lo que entró.')).toBeNull()
  })

  it('breaks down where it came from, what it went on, the cartons and the fiado', async () => {
    open('/resumenes?periodo=mes&desde=2026-10-01')
    await screen.findByText('₡412.000')

    expect(lines('De dónde entró')).toEqual(['Contado₡352.000', 'Abonos₡60.000'])
    expect(lines('En qué se gastó')).toEqual([
      'Alimento₡310.000',
      'Cartones₡62.500',
      'Vitaminas₡34.000',
      'Otro₡30.000',
    ])
    expect(lines('Cartones vendidos')).toEqual(['De 15 huevos120 cartones', 'De 30 huevos1 cartón'])
    expect(lines('Fiado')).toEqual([
      'Fiado del mes (por cobrar)₡48.000',
      'Por cobrar en total₡96.500',
      'Lo que deben hoy todos los clientes.',
    ])
  })

  it('ranks the customers who were named, and says what was sold to nobody in particular', async () => {
    open('/resumenes?periodo=mes&desde=2026-10-01')
    await screen.findByText('₡412.000')

    const best = section('Mejores clientes')
    expect(within(best).getByText(/^Solo cuenta las ventas en que se anotó quién compró/)).toBeTruthy()
    expect(within(best).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      '1.Doña Rosa40 de 15 · 1 de 30₡100.500',
      '2.Don Luis (borrado)12 de 15₡30.000',
    ])
    expect(lines('Mejores clientes').slice(-2)).toEqual(['Y 1 cliente más₡1.500', 'Ventas sin cliente₡268.000'])

    // Something to read, not to press.
    expect(within(best).queryAllByRole('button')).toEqual([])
  })

  it('with sales but nobody named, says so instead of an empty ranking', async () => {
    summaryReply = () => json({ ...OCTOBER, bestCustomers: { ...NOBODY_NAMED, withoutCustomer: 400000 } })
    open('/resumenes?periodo=mes&desde=2026-10-01')
    await screen.findByText('₡412.000')

    expect(lines('Mejores clientes')).toEqual([
      'Solo cuenta las ventas en que se anotó quién compró (al contado y fiado).',
      'En este período no se anotó quién compró en ninguna venta.',
      'Ventas sin cliente₡400.000',
    ])
    expect(within(section('Mejores clientes')).queryByRole('list')).toBeNull()
  })

  it('lists the month day by day, and a day opens its own summary', async () => {
    const { router, user } = open('/resumenes?periodo=mes&desde=2026-10-01')
    await screen.findByText('₡412.000')

    const days = within(section('Día por día')).getAllByRole('button')
    expect(days.map((day) => day.textContent)).toEqual([
      'lun 5 oct 2026Entró ₡52.000Gastado ₡31.000Quedó ₡21.000',
      'mar 6 oct 2026Entró ₡18.000Gastado ₡20.000Quedó −₡2.000',
    ])

    await user.click(days[1])
    expect(router.state.location.search).toBe('?periodo=dia&desde=2026-10-06')
    expect(await screen.findByText('martes, 6 de octubre de 2026')).toBeTruthy()
    expect(summaryCalls().at(-1)).toBe('2026-10-06..2026-10-06')
  })

  it('a single day has no day-by-day list and says "Fiado del día"', async () => {
    summaryReply = () => json({ ...OCTOBER, from: '2026-10-06', to: '2026-10-06' })
    open('/resumenes?periodo=dia&desde=2026-10-06')
    await screen.findByText('₡412.000')

    expect(screen.queryByRole('region', { name: 'Día por día' })).toBeNull()
    expect(lines('Fiado')[0]).toBe('Fiado del día (por cobrar)₡48.000')
  })

  it('steps back and forward, and stops at the current period', async () => {
    const { user } = open('/resumenes?periodo=mes&desde=2026-10-01')
    await screen.findByText('octubre de 2026')

    await user.click(button('Anterior'))
    expect(await screen.findByText('setiembre de 2026')).toBeTruthy()
    expect(summaryCalls().at(-1)).toBe('2026-09-01..2026-09-30')
    expect(button('Este mes').getAttribute('aria-pressed')).toBe('false')

    await user.click(button('Siguiente'))
    expect(await screen.findByText('octubre de 2026')).toBeTruthy()
  })

  it('going forward into the current period turns off Siguiente and keeps focus on a button', async () => {
    const { user } = open('/resumenes?periodo=dia&desde=' + todayLocal(new Date(Date.now() - 86_400_000)))
    await screen.findByText('No hubo ventas, abonos ni gastos en este período.')

    await user.click(button('Siguiente'))

    expect(button('Siguiente')).toHaveProperty('disabled', true)
    expect(button('Hoy').getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(button('Anterior'))
  })

  it('an empty period shows zeros, says so, and still shows what is owed', async () => {
    open('/resumenes?periodo=dia&desde=' + TODAY)

    expect(await screen.findByText('No hubo ventas, abonos ni gastos en este período.')).toBeTruthy()
    expect(big('Entró').textContent).toBe('Entró₡0')
    expect(big('Quedó').textContent).toBe('Quedó₡0')
    expect(screen.queryByRole('region', { name: 'En qué se gastó' })).toBeNull()
    expect(screen.getByText('Por cobrar en total').nextSibling?.textContent).toBe('₡8.000')
  })

  it('offers to try again when the summary fails to load', async () => {
    let fail = true
    summaryReply = () => (fail ? json({}, 500) : json(EMPTY))
    const { user } = open('/resumenes')

    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo cargar el resumen.')

    fail = false
    await user.click(button('Intentar de nuevo'))
    expect(await screen.findByText('No hubo ventas, abonos ni gastos en este período.')).toBeTruthy()
  })
})
