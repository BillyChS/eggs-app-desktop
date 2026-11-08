import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateLong, todayLocal, yesterdayLocal } from '../../lib/dates'
import { addressOf, fakeApi, json, noContent, openApp } from '../../test/api'
import { periodOf, rangeOf, step } from '../summaries/periods'

const TODAY = todayLocal()
const YESTERDAY = yesterdayLocal()
const OLD_DAY = '2026-01-05'
const THIS_MONTH = periodOf('month', TODAY)
const LAST_MONTH = step(THIS_MONTH, -1)

const line = (cartonType: 'A' | 'B', quantity: number, unitPrice: number) => ({
  cartonType,
  quantity,
  unitPrice,
  lineTotal: quantity * unitPrice,
})

const ROSA = { id: 'r', name: 'Doña Rosa Vargas', isDeleted: false, phone: '8812-4455' }
const LUIS = { id: 'l', name: 'Don Luis Mora', isDeleted: false, phone: '8703-2291' }
const MARIA = { id: 'm', name: 'María Rodríguez', isDeleted: false, phone: null }

const sale = (id: string, rest: object) => ({ id, date: TODAY, paidNow: 0, owed: 0, ...rest })

const CASH_ROSA = sale('1', { total: 13500, isCredit: false, customer: ROSA, items: [line('B', 3, 4500)] })
const CASH_NOBODY = sale('2', { total: 4000, isCredit: false, customer: null, items: [line('A', 2, 2000)] })
const CREDIT_LUIS = sale('3', {
  total: 10000,
  isCredit: true,
  customer: LUIS,
  items: [line('B', 2, 5000)],
  paidNow: 4000,
  owed: 6000,
})
const CREDIT_MARIA = sale('4', {
  total: 6000,
  isCredit: true,
  customer: MARIA,
  items: [line('A', 1, 2000), line('A', 2, 2000)],
  owed: 0,
})
const SALES = [CASH_ROSA, CASH_NOBODY, CREDIT_LUIS, CREDIT_MARIA]

const ABONO_MARIA = { id: '7', customer: MARIA, date: TODAY, amount: 2000, note: 'en efectivo', saleId: null }
const ABONO_LUIS = { id: '8', customer: LUIS, date: TODAY, amount: 4000, note: null, saleId: '3' }

const SUMMARY = {
  cameIn: { cash: 17500, payments: 6000, total: 23500 },
  spent: { total: 0, byCategory: [] },
  net: 23500,
  creditSold: 16000,
  owedTotal: 6000,
  cartons: [
    { cartonType: 'A', quantity: 5 },
    { cartonType: 'B', quantity: 5 },
  ],
  days: [],
  bestCustomers: { top: [], othersCount: 0, othersTotal: 0, withoutCustomer: 0 },
}

const api = fakeApi()
const { calls, handlers, callsTo } = api

function serveDay() {
  handlers['GET /api/sales'] = () => json({ sales: SALES, cashTotal: 17500, creditTotal: 16000 })
  handlers['GET /api/payments'] = () => json({ payments: [ABONO_MARIA, ABONO_LUIS], total: 6000 })
  handlers['GET /api/reports/summary'] = ({ url }) =>
    json({ ...SUMMARY, from: url.searchParams.get('from'), to: url.searchParams.get('to') })
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const pressed = (name: string | RegExp) => button(name).getAttribute('aria-pressed')
const card = (label: string | RegExp) => screen.getByText(label).parentElement!.textContent
const rows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .slice(0, -1)
        .map((cell) => cell.textContent),
    )
const footer = () => screen.getByText(/^Total ₡/).parentElement!.textContent
const search = () => screen.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' })
const lastQuery = (path: string) => callsTo('GET', path).at(-1)!.url.searchParams

beforeEach(() => {
  api.reset({
    'GET /api/health': () => json({ status: 'ok', time: '2026-11-04T10:00:00' }),
    'GET /api/sales': () => json({ sales: [], cashTotal: 0, creditTotal: 0 }),
    'GET /api/payments': () => json({ payments: [], total: 0 }),
    'GET /api/reports/summary': () =>
      json({ ...SUMMARY, cameIn: { cash: 0, payments: 0, total: 0 }, creditSold: 0, cartons: [] }),
    'GET /api/sales/last-prices': () => json({}),
    'GET /api/customers': () => json({ items: [], owedTotal: 0 }),
    'GET /api/customers/l': () => json({ ...LUIS, notes: null, balance: 6000 }),
    'GET /api/customers/m': () => json({ ...MARIA, notes: null, balance: 0 }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Ventas: the period', () => {
  it('opens on today and Contado, asking the sales, abonos and summary of that one day', async () => {
    openApp('/ventas')
    await screen.findByText('No hay ventas al contado en este período.')

    for (const path of ['/api/sales', '/api/payments', '/api/reports/summary']) {
      expect(lastQuery(path).get('from')).toBe(TODAY)
      expect(lastQuery(path).get('to')).toBe(TODAY)
    }
    expect(screen.getByText(formatDateLong(TODAY)!)).toBeTruthy()
    expect(pressed('Hoy')).toBe('true')
    expect(pressed(/^Contado/)).toBe('true')
    expect(screen.queryByRole('columnheader', { name: 'Fecha' })).toBeNull()
  })

  it('Ayer shows yesterday and keeps it in the address; Hoy comes back', async () => {
    const { router, user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.click(button('Ayer'))
    expect(addressOf(router)).toBe(`/ventas?fecha=${YESTERDAY}`)
    expect(pressed('Ayer')).toBe('true')
    await waitFor(() => expect(lastQuery('/api/sales').get('from')).toBe(YESTERDAY))
    expect(await screen.findByText('Entró ayer')).toBeTruthy()

    await user.click(button('Hoy'))
    expect(addressOf(router)).toBe(`/ventas?fecha=${TODAY}`)
  })

  it('Otro día opens a date field, and the button then says the day', async () => {
    const { router, user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.click(button(/Otro día/))
    const date = screen.getByLabelText<HTMLInputElement>('Día')
    expect(document.activeElement).toBe(date)

    await user.clear(date)
    await user.type(date, OLD_DAY)

    expect(addressOf(router)).toBe(`/ventas?fecha=${OLD_DAY}`)
    expect(pressed('5 ene 2026')).toBe('true')
    expect(await screen.findByText('Entró ese día')).toBeTruthy()
    await waitFor(() => expect(lastQuery('/api/sales').get('from')).toBe(OLD_DAY))
  })

  it('an address with another day opens on it, with its date field', async () => {
    openApp(`/ventas?fecha=${OLD_DAY}`)

    expect(await screen.findByText(formatDateLong(OLD_DAY)!)).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('Día').value).toBe(OLD_DAY)
  })

  it.each(['no-es-fecha', '2026-02-30', '2999-01-01'])('an address with %s opens on today', async (day) => {
    openApp(`/ventas?fecha=${day}`)

    await screen.findByRole('table')
    expect(lastQuery('/api/sales').get('from')).toBe(TODAY)
  })

  it('Este mes asks from the first to today, adds the Fecha column, and stops › at this month', async () => {
    serveDay()
    const { router, user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.click(button('Este mes'))

    expect(addressOf(router)).toBe(`/ventas?mes=${THIS_MONTH.start.slice(0, 7)}`)
    expect(pressed('Este mes')).toBe('true')
    await waitFor(() => expect(lastQuery('/api/sales').get('from')).toBe(THIS_MONTH.start))
    expect(lastQuery('/api/sales').get('to')).toBe(TODAY)
    expect(lastQuery('/api/reports/summary').get('to')).toBe(TODAY)
    expect(await screen.findByRole('columnheader', { name: 'Fecha' })).toBeTruthy()
    expect(screen.getByText('Entró en el mes')).toBeTruthy()
    expect(screen.getByText('Fiado del mes')).toBeTruthy()
    expect((button('Mes siguiente') as HTMLButtonElement).disabled).toBe(true)
  })

  it('‹ goes to the whole of last month, and › comes back to this one', async () => {
    const { router, user } = openApp(`/ventas?mes=${THIS_MONTH.start.slice(0, 7)}`)
    await screen.findByRole('table')

    await user.click(button('Mes anterior'))

    const last = rangeOf(LAST_MONTH)
    expect(addressOf(router)).toBe(`/ventas?mes=${LAST_MONTH.start.slice(0, 7)}`)
    await waitFor(() => expect(lastQuery('/api/sales').get('from')).toBe(last.from))
    expect(lastQuery('/api/sales').get('to')).toBe(last.to)
    expect((button('Mes siguiente') as HTMLButtonElement).disabled).toBe(false)

    await user.click(button('Mes siguiente'))
    expect(addressOf(router)).toBe(`/ventas?mes=${THIS_MONTH.start.slice(0, 7)}`)
  })

  it('a month shows the day of each row', async () => {
    serveDay()
    openApp(`/ventas?mes=${THIS_MONTH.start.slice(0, 7)}&pestana=fiado`)

    await screen.findByRole('table')
    await waitFor(() => expect(rows()).toHaveLength(2))
    const [weekday, day, month] = rows()[0][0]!.split(' ')
    expect(weekday).toMatch(/^(dom|lun|mar|mié|jue|vie|sáb)$/)
    expect(Number(day)).toBe(Number(TODAY.slice(8)))
    expect(month).toMatch(/^[a-z]{3}$/)
  })

  it('never shows another period’s numbers while the new one loads', async () => {
    serveDay()
    const { user } = openApp('/ventas')
    await screen.findByText('₡23.500')

    handlers['GET /api/sales'] = () => new Promise(() => {})
    await user.click(button('Ayer'))

    expect(screen.queryByText('₡23.500')).toBeNull()
    expect(screen.getByText('Cargando…').getAttribute('role')).toBe('status')
  })

  it('when the period can not load, says so and can try again', async () => {
    handlers['GET /api/sales'] = () => new Response('', { status: 500 })
    const { user } = openApp('/ventas')

    expect((await screen.findByRole('alert')).textContent).toBe('No se pudieron cargar las ventas.')

    serveDay()
    await user.click(button('Intentar de nuevo'))

    expect(await screen.findByRole('table')).toBeTruthy()
  })
})

describe('Ventas: the cards', () => {
  it('are the summary’s numbers: Entró with its parts, the fiado sold, and the cartons', async () => {
    serveDay()
    openApp('/ventas')

    await screen.findByText('Entró hoy')
    expect(card('Entró hoy')).toBe('Entró hoy₡23.500Contado ₡17.500 · Abonos ₡6.000')
    expect(card('Fiado hoy')).toBe('Fiado hoy₡16.0002 ventas fiadas')
    expect(card('Cartones vendidos')).toBe('Cartones vendidos105 de 15 · 5 de 30')
  })
})

describe('Ventas: the list', () => {
  it('Contado lists the cash sales, with nobody named as Cliente sin nombre', async () => {
    serveDay()
    openApp('/ventas')

    await screen.findByRole('table')
    expect(rows()).toEqual([
      ['Doña Rosa Vargas3 cartones de 30', '8812-4455', '₡13.500', 'Pagado'],
      ['Cliente sin nombre2 cartones de 15', '—', '₡4.000', 'Pagado'],
    ])
    expect(footer()).toBe('2 ventas al contadoTotal ₡17.500')
  })

  it('Fiado lists the credit sales with what each still owes, and stays in the address', async () => {
    serveDay()
    const { router, user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.click(button(/^Fiado/))

    expect(addressOf(router)).toBe(`/ventas?fecha=${TODAY}&pestana=fiado`)
    expect(rows()).toEqual([
      ['Don Luis Mora2 cartones de 30', '8703-2291', '₡10.000', 'Debe ₡6.000'],
      ['María Rodríguez3 cartones de 15', '—', '₡6.000', 'Pagado con abonos'],
    ])
    expect(footer()).toBe('2 ventas fiadasTotal ₡16.000')
  })

  it('each tab says how many it has, whatever the search', async () => {
    serveDay()
    const { user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.type(search(), 'rosa')

    expect(button(/^Fiado/).textContent).toBe('Fiado2')
    expect(button(/^Contado/).textContent).toBe('Contado2')
    expect(button(/^Abonos/).textContent).toBe('Abonos2')
  })

  it('Abonos lists the abonos; one paid with its sale opens that sale instead', async () => {
    serveDay()
    handlers['GET /api/sales/3'] = () => json(CREDIT_LUIS)
    const { router, user } = openApp('/ventas?pestana=abonos')
    await screen.findByRole('table')

    expect(screen.getByRole('columnheader', { name: 'Monto' })).toBeTruthy()
    expect(rows()).toEqual([
      ['María RodríguezAbono', '—', '₡2.000', 'en efectivo'],
      ['Don Luis MoraAbono al hacer la venta', '8703-2291', '₡4.000', ''],
    ])
    expect(footer()).toBe('2 abonosTotal ₡6.000')
    expect(screen.queryByRole('button', { name: 'Eliminar el abono de Don Luis Mora' })).toBeNull()

    await user.click(button('Abrir la venta'))
    expect(addressOf(router)).toBe(`/ventas/3/editar?fecha=${TODAY}&pestana=abonos`)
  })

  it('an abono’s Editar opens it, and Volver comes back to the same view', async () => {
    serveDay()
    handlers['GET /api/payments/7'] = () => json(ABONO_MARIA)
    handlers['GET /api/customers/m'] = () => json({ ...MARIA, notes: null, balance: 4000 })
    const { router, user } = openApp(`/ventas?fecha=${TODAY}&pestana=abonos`)
    await screen.findByRole('table')

    await user.click(button('Editar el abono de María Rodríguez'))
    expect(addressOf(router)).toBe(`/clientes/m/abonos/7/editar?fecha=${TODAY}&pestana=abonos`)

    await user.click(await screen.findByRole('button', { name: 'Volver' }))
    expect(addressOf(router)).toBe(`/ventas?fecha=${TODAY}&pestana=abonos`)
  })

  it('a deleted customer is named as such', async () => {
    handlers['GET /api/sales'] = () =>
      json({ sales: [{ ...CREDIT_LUIS, customer: { ...LUIS, isDeleted: true } }], cashTotal: 0, creditTotal: 10000 })
    openApp('/ventas?pestana=fiado')

    await screen.findByRole('table')
    expect(rows()[0][0]).toBe('Don Luis Mora (borrado)2 cartones de 30')
  })

  it('an empty tab says so', async () => {
    openApp('/ventas?pestana=fiado')

    expect((await screen.findByText('No hay ventas fiadas en este período.')).getAttribute('role')).toBe('status')
    expect(footer()).toBe('0 ventas fiadasTotal ₡0')
  })
})

describe('Ventas: search', () => {
  it.each([
    ['a name without accents', 'dona rosa', 'Doña Rosa Vargas'],
    ['part of a name, any case', 'VARG', 'Doña Rosa Vargas'],
    ['a phone without its dash', '88124455', 'Doña Rosa Vargas'],
    ['a phone with it', '8812-4455', 'Doña Rosa Vargas'],
    ['Cliente sin nombre', 'sin nombre', 'Cliente sin nombre'],
  ])('finds %s', async (_case, text, name) => {
    serveDay()
    const { user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.type(search(), text)

    expect(rows().map((row) => row[0])).toEqual([expect.stringContaining(name)])
  })

  it('the footer adds up only what is shown, and nothing found says so', async () => {
    serveDay()
    const { user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.type(search(), 'rosa')
    expect(footer()).toBe('1 venta al contadoTotal ₡13.500')

    await user.clear(search())
    await user.type(search(), 'Pedro')
    expect(screen.getByText('No se encontró nada con “Pedro”.')).toBeTruthy()
    expect(footer()).toBe('0 ventas al contadoTotal ₡0')
  })

  it('a digit in a name does not match every phone', async () => {
    serveDay()
    const { user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.type(search(), 'rosa 8')

    expect(screen.getByText('No se encontró nada con “rosa 8”.')).toBeTruthy()
  })
})

describe('Ventas: buttons', () => {
  it('Nueva venta carries the view, so the form starts on its day and comes back to it', async () => {
    const { router, user } = openApp(`/ventas?fecha=${OLD_DAY}&pestana=fiado`)
    await screen.findByRole('table')

    await user.click(button('Nueva venta'))

    expect(addressOf(router)).toBe(`/ventas/nueva?fecha=${OLD_DAY}&pestana=fiado`)
    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toBe(OLD_DAY)

    await user.click(button('Cancelar'))
    expect(addressOf(router)).toBe(`/ventas?fecha=${OLD_DAY}&pestana=fiado`)
  })

  it('Nueva venta from a month starts on today', async () => {
    const { user } = openApp(`/ventas?mes=${LAST_MONTH.start.slice(0, 7)}`)
    await screen.findByRole('table')

    await user.click(button('Nueva venta'))

    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toBe(TODAY)
  })

  it('Editar opens the sale with the view, and Cancelar comes back to it', async () => {
    serveDay()
    handlers['GET /api/sales/1'] = () => json(CASH_ROSA)
    const { router, user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.click(button('Editar la venta de Doña Rosa Vargas'))
    expect(addressOf(router)).toBe(`/ventas/1/editar?fecha=${TODAY}`)

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(addressOf(router)).toBe(`/ventas?fecha=${TODAY}`)
  })

  it('Eliminar asks first, with what it does to the balance, and focus on the safe choice', async () => {
    serveDay()
    const { user } = openApp('/ventas?pestana=fiado')
    await screen.findByRole('table')

    await user.click(button('Eliminar la venta de Don Luis Mora'))

    const confirm = await screen.findByRole('alertdialog')
    expect(confirm.textContent).toContain(
      '¿Borrar la venta fiada de ₡10.000 a Don Luis Mora? También se borra el abono de ₡4.000 que dio al hacerla. ' +
        'Su saldo bajará de ₡6.000 a ₡0.',
    )
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'No, cancelar' }))

    await user.click(within(confirm).getByRole('button', { name: 'No, cancelar' }))
    expect(callsTo('DELETE', '/api/sales/3')).toEqual([])
  })

  it('confirming deletes, says so, and loads the list again', async () => {
    serveDay()
    handlers['DELETE /api/sales/2'] = () => noContent()
    const { user } = openApp('/ventas')
    await screen.findByRole('table')
    const loads = callsTo('GET', '/api/sales').length

    await user.click(button('Eliminar la venta de Cliente sin nombre'))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm.textContent).toContain('¿Borrar la venta de ₡4.000 (2 de 15)? Ya no contará en el total del día.')
    await user.click(within(confirm).getByRole('button', { name: 'Sí, borrar' }))

    expect((await screen.findByRole('alertdialog')).textContent).toContain('Venta borrada.')
    expect(callsTo('DELETE', '/api/sales/2')).toHaveLength(1)
    await waitFor(() => expect(callsTo('GET', '/api/sales').length).toBe(loads + 1))
  })

  it('what the API refuses is shown as it says it', async () => {
    serveDay()
    handlers['DELETE /api/sales/3'] = () =>
      json({ message: 'Don Luis Mora ya abonó ₡15.000. Primero corrija o borre un abono.' }, 409)
    const { user } = openApp('/ventas?pestana=fiado')
    await screen.findByRole('table')

    await user.click(button('Eliminar la venta de Don Luis Mora'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, borrar' }))

    expect((await screen.findByRole('alertdialog')).textContent).toContain('Don Luis Mora ya abonó ₡15.000.')
  })

  it('an abono’s Eliminar asks with what it does to the balance, then deletes it', async () => {
    serveDay()
    handlers['DELETE /api/payments/7'] = () => noContent()
    const { user } = openApp('/ventas?pestana=abonos')
    await screen.findByRole('table')

    await user.click(button('Eliminar el abono de María Rodríguez'))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm.textContent).toContain(
      `¿Borrar el abono de ₡2.000 de María Rodríguez del ${formatDateLong(TODAY)}? Su saldo subirá de ₡0 a ₡2.000.`,
    )
    await user.click(within(confirm).getByRole('button', { name: 'Sí, borrar' }))

    expect((await screen.findByRole('alertdialog')).textContent).toContain('Abono borrado. Ahora debe ₡2.000.')
    expect(callsTo('DELETE', '/api/payments/7')).toHaveLength(1)
  })

  it('a double click on Eliminar asks once', async () => {
    serveDay()
    const { user } = openApp('/ventas')
    await screen.findByRole('table')

    await user.dblClick(button('Eliminar la venta de Doña Rosa Vargas'))

    expect(await screen.findAllByRole('alertdialog')).toHaveLength(1)
    expect(calls.filter((call) => call.method === 'DELETE')).toEqual([])
  })
})
