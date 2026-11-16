import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateLong, todayLocal, yesterdayLocal } from '../../lib/dates'
import { addressOf, fakeApi, json, noContent, openApp, type Reply, type User } from '../../test/api'
import { describePeriod, periodOf, rangeOf, step } from '../summaries/periods'

const TODAY = todayLocal()
const YESTERDAY = yesterdayLocal()
const OLD_DAY = '2026-11-02'
const THIS_WEEK = periodOf('week', TODAY)
const LAST_WEEK = step(THIS_WEEK, -1)
const THIS_MONTH = periodOf('month', TODAY)

const category = (id: string, name: string, needsDescription = false, isRetired = false) => ({
  id,
  name,
  needsDescription,
  isRetired,
})

const CATEGORIES = [
  category('c1', 'Alimento'),
  category('c2', 'Vitaminas'),
  category('c3', 'Desparasitantes'),
  category('c4', 'Burucha'),
  category('c5', 'Cartones'),
  category('c6', 'Plásticos/Envoltorios'),
  category('c7', 'Equipo'),
  category('c8', 'Otro', true),
]
const ALIMENTO = CATEGORIES[0]
const OTRO = CATEGORIES[7]

const FEED = { id: 'e1', date: OLD_DAY, category: ALIMENTO, amount: 31000, note: '2 sacos' }
const GAS = { id: 'e2', date: OLD_DAY, category: OTRO, amount: 5000, note: 'Gasolina' }
const OLD_TRAYS = { id: 'e3', date: OLD_DAY, category: category('c9', 'Bandejas', false, true), amount: 2500, note: null }

const total = (name: string, amount: number, id = name, count = 1) => ({ id, name, total: amount, count })
const OLD_DAY_LIST = {
  expenses: [GAS, FEED],
  total: 36000,
  byCategory: [total('Alimento', 31000), total('Otro', 5000)],
}
const NOTHING = { expenses: [], total: 0, byCategory: [] }

const api = fakeApi()
const { handlers, callsTo } = api

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const pressed = (name: string | RegExp) => button(name).getAttribute('aria-pressed')
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label)
const card = (label: string | RegExp) => screen.getByText(label).parentElement!.textContent
const lastQuery = () => callsTo('GET', '/api/expenses').at(-1)!.url.searchParams
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

const typeOf = () => button(/^¿Qué tipo de gasto\?/)
const save = () => button('Guardar gasto')
const confirmation = () => screen.findByRole('alertdialog', { name: 'Ventana de confirmación' })
const posted = () => callsTo('POST', '/api/expenses').map((call) => call.body)

async function choose(user: User, option: string) {
  await user.click(typeOf())
  await user.click(screen.getByRole('option', { name: option }))
}

async function listo(user: User) {
  await user.click(within(await confirmation()).getByRole('button', { name: 'Listo' }))
}

const echoExpense: Reply = ({ body }) => {
  const { categoryId, note, ...rest } = body as { categoryId: string; note: string }
  const chosen = [...CATEGORIES, OLD_TRAYS.category].find((candidate) => candidate.id === categoryId)
  return json({ id: 'e9', category: chosen, note: note || null, ...rest }, 201)
}

beforeEach(() => {
  api.reset({
    'GET /api/health': () => json({ status: 'ok', time: '2026-11-04T10:00:00' }),
    'GET /api/expense-categories': () => json(CATEGORIES),
    // Only that one day: a week can start on it too.
    'GET /api/expenses': ({ url }) =>
      json(url.searchParams.get('from') === OLD_DAY && url.searchParams.get('to') === OLD_DAY ? OLD_DAY_LIST : NOTHING),
    'POST /api/expenses': echoExpense,
    'GET /api/expenses/e1': () => json(FEED),
    'GET /api/expenses/e2': () => json(GAS),
    'GET /api/expenses/e3': () => json(OLD_TRAYS),
    'PUT /api/expenses/e1': echoExpense,
    'PUT /api/expenses/e2': echoExpense,
    'DELETE /api/expenses/e1': () => noContent(),
    'DELETE /api/expenses/e2': () => noContent(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Gastos: the page', () => {
  it('opens on today: the long date, Hoy, "Gastado hoy" apart from its amount, and an empty list that offers a new one', async () => {
    const { router, user } = openApp('/gastos')

    expect(await screen.findByText('No hay gastos registrados hoy.')).toBeTruthy()
    expect(lastQuery().get('from')).toBe(TODAY)
    expect(lastQuery().get('to')).toBe(TODAY)
    expect(screen.getByRole('heading', { name: 'Gastos' })).toBeTruthy()
    expect(screen.getByText(formatDateLong(TODAY)!)).toBeTruthy()
    expect(pressed('Hoy')).toBe('true')

    // The label and the amount are two lines of the card, not "Gastado hoy₡0" run together.
    const spent = screen.getByText('Gastado hoy')
    expect(spent.nextElementSibling!.textContent).toBe('₡0')
    expect(card('Gastado hoy')).toContain('0 gastos')
    expect(card('En qué se gastó')).toContain('Nada todavía.')

    const empty = screen.getByRole('region', { name: 'Lista de gastos' })
    await user.click(within(empty).getByRole('button', { name: 'Nuevo gasto' }))
    expect(addressOf(router)).toBe(`/gastos/nuevo?fecha=${TODAY}`)
  })

  it('lists the day: Tipo ("Otro" by what it was), Nota, Monto, and a footer with how many and the total', async () => {
    openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')

    expect(screen.queryByRole('columnheader', { name: 'Fecha' })).toBeNull()
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Tipo',
      'Nota',
      'Monto',
      'Acciones',
    ])
    expect(rows()).toEqual([
      ['GasolinaOtro', '', '₡5.000'],
      ['Alimento', '2 sacos', '₡31.000'],
    ])
    expect(screen.getByText(/^Total ₡/).parentElement!.textContent).toBe('2 gastosTotal ₡36.000')
    expect(card('Gastado ese día')).toBe('Gastado ese día₡36.0002 gastos')
    const spentOn = screen.getByRole('list', { name: 'En qué se gastó' })
    expect(within(spentOn).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Alimento₡31.000',
      'Otro₡5.000',
    ])
  })

  it('"En qué se gastó" shows up to four types, and past that the top three and "Lo demás (N tipos)"', async () => {
    handlers['GET /api/expenses'] = () =>
      json({
        expenses: [FEED],
        total: 50000,
        byCategory: [
          total('Alimento', 30000),
          total('Equipo', 9000),
          total('Vitaminas', 5000),
          total('Burucha', 4000),
          total('Cartones', 2000),
        ],
      })
    openApp('/gastos')

    const spentOn = await screen.findByRole('list', { name: 'En qué se gastó' })
    expect(within(spentOn).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Alimento₡30.000',
      'Equipo₡9.000',
      'Vitaminas₡5.000',
      'Lo demás (2 tipos)₡6.000',
    ])
  })

  it('Ayer shows yesterday and keeps it in the address', async () => {
    const { router, user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')

    await user.click(button('Ayer'))

    expect(addressOf(router)).toBe(`/gastos?fecha=${YESTERDAY}`)
    expect(await screen.findByText('No hay gastos registrados ayer.')).toBeTruthy()
    expect(card('Gastado ayer')).toContain('₡0')
    expect(lastQuery().get('from')).toBe(YESTERDAY)
  })

  it('Esta semana asks from Monday to today, adds Fecha, and ‹ › go through whole weeks, never past this one', async () => {
    const { router, user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')

    await user.click(button('Esta semana'))

    expect(addressOf(router)).toBe(`/gastos?semana=${THIS_WEEK.start}`)
    expect(pressed('Esta semana')).toBe('true')
    await waitFor(() => expect(lastQuery().get('from')).toBe(THIS_WEEK.start))
    expect(lastQuery().get('to')).toBe(TODAY)
    expect(await screen.findByText('No hay gastos registrados esta semana.')).toBeTruthy()
    expect(card('Gastado esta semana')).toContain('₡0')
    expect(screen.getByText(`Todos los gastos del ${describePeriod(THIS_WEEK)}`)).toBeTruthy()
    expect(button('Semana siguiente').hasAttribute('disabled')).toBe(true)

    await user.click(button('Semana anterior'))

    expect(addressOf(router)).toBe(`/gastos?semana=${LAST_WEEK.start}`)
    await waitFor(() => expect(lastQuery().get('from')).toBe(LAST_WEEK.start))
    expect(lastQuery().get('to')).toBe(rangeOf(LAST_WEEK).to)
    expect(await screen.findByText('No hay gastos registrados en la semana.')).toBeTruthy()

    await user.click(button('Semana siguiente'))
    expect(addressOf(router)).toBe(`/gastos?semana=${THIS_WEEK.start}`)
  })

  it('a week or a month shows the day of each row', async () => {
    handlers['GET /api/expenses'] = () => json(OLD_DAY_LIST)
    openApp(`/gastos?mes=${THIS_MONTH.start.slice(0, 7)}`)

    expect(await screen.findByRole('columnheader', { name: 'Fecha' })).toBeTruthy()
    expect(pressed('Este mes')).toBe('true')
    expect(lastQuery().get('from')).toBe(THIS_MONTH.start)
    expect(card('Gastado este mes')).toContain('₡36.000')
    const [weekday, day, month] = rows()[0][0]!.split(' ')
    expect(weekday).toBe('lun')
    expect(day).toBe('2')
    expect(month).toBe('nov')
  })

  it('Editar opens the expense with the period, and Cancelar comes back to it', async () => {
    const { router, user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')

    await user.click(button('Editar el gasto de Alimento'))
    expect(addressOf(router)).toBe(`/gastos/e1/editar?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Editar gasto' })

    await user.click(button('Cancelar'))
    expect(addressOf(router)).toBe(`/gastos?fecha=${OLD_DAY}`)
  })

  it('Eliminar asks first, saying what it was; Sí, borrar deletes it and loads the list again', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')

    await user.click(button('Eliminar el gasto de Gasolina'))
    const question = await screen.findByRole('alertdialog', { name: '¿Borrar este gasto?' })
    expect(question.textContent).toContain(`¿Borrar el gasto de Gasolina de ₡5.000 del ${formatDateLong(OLD_DAY)}?`)
    expect(callsTo('DELETE', '/api/expenses/e2')).toEqual([])

    const before = callsTo('GET', '/api/expenses').length
    await user.click(within(question).getByRole('button', { name: 'Sí, borrar' }))

    await waitFor(() => expect(callsTo('DELETE', '/api/expenses/e2')).toHaveLength(1))
    expect(await screen.findByText('Gasto borrado.')).toBeTruthy()
    await waitFor(() => expect(callsTo('GET', '/api/expenses').length).toBeGreaterThan(before))
  })

  it('when the list can not load, says so and can try again', async () => {
    handlers['GET /api/expenses'] = () => new Response('', { status: 500 })
    const { user } = openApp('/gastos')

    expect((await screen.findByRole('alert')).textContent).toBe('No se pudieron cargar los gastos.')
    handlers['GET /api/expenses'] = () => json(NOTHING)
    await user.click(button('Intentar de nuevo'))

    expect(await screen.findByText('No hay gastos registrados hoy.')).toBeTruthy()
  })
})

describe('Gastos: the form', () => {
  it('is a page with the type first, starting at "Elija uno", "Otro" last, and the bar with the total and buttons', async () => {
    const { user } = openApp(`/gastos/nuevo?fecha=${OLD_DAY}`)

    expect(await screen.findByRole('heading', { name: 'Nuevo gasto' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(typeOf()))
    expect(typeOf().textContent).toContain('Elija uno')
    expect(screen.queryByRole('button', { name: /Volver/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Borrar gasto' })).toBeNull()
    expect(screen.getByText('Total del gasto').parentElement!.textContent).toBe('Total del gasto₡0')
    expect(field('Fecha').value).toBe(OLD_DAY)
    expect(screen.queryByLabelText('¿Qué gasto fue?')).toBeNull()
    expect(field('Nota (opcional)')).toBeTruthy()

    await user.click(typeOf())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(
      CATEGORIES.map((candidate) => candidate.name),
    )
  })

  it('"Otro" shows "¿Qué gasto fue?" right below, with focus in it, and no Nota; another type hides and clears it', async () => {
    const { user } = openApp('/gastos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo gasto' })

    await choose(user, 'Otro')

    await waitFor(() => expect(document.activeElement).toBe(field('¿Qué gasto fue?')))
    expect(screen.queryByLabelText('Nota (opcional)')).toBeNull()
    await user.type(field('¿Qué gasto fue?'), 'Gasolina')

    await choose(user, 'Alimento')

    expect(screen.queryByLabelText('¿Qué gasto fue?')).toBeNull()
    expect(field('Nota (opcional)')).toBeTruthy()
    expect(document.activeElement).toBe(field('Monto'))

    await choose(user, 'Otro')
    await waitFor(() => expect(field('¿Qué gasto fue?').value).toBe(''))
  })

  it('asks for what is missing next to each field, with focus on the first, and opens nothing', async () => {
    const { user } = openApp('/gastos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo gasto' })

    await user.click(save())

    expect(screen.getByText('Elija el tipo de gasto.')).toBeTruthy()
    expect(screen.getByText('Escriba el monto.')).toBeTruthy()
    expect(document.activeElement).toBe(typeOf())
    expect(screen.queryByRole('alertdialog')).toBeNull()

    await choose(user, 'Otro')
    await user.type(field('Monto'), '5000')
    await user.click(save())

    expect(screen.getByText('Escriba qué gasto fue.')).toBeTruthy()
    expect(document.activeElement).toBe(field('¿Qué gasto fue?'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(posted()).toEqual([])
  })

  it('Enter moves on, type → Monto → Nota → Guardar gasto, which only asks, with focus on Editar', async () => {
    const { user } = openApp(`/gastos/nuevo?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Nuevo gasto' })

    await choose(user, 'Alimento')
    expect(document.activeElement).toBe(field('Monto'))
    await user.keyboard('31000{Enter}')
    expect(document.activeElement).toBe(field('Nota (opcional)'))
    await user.keyboard('2 sacos{Enter}')
    expect(document.activeElement).toBe(save())
    expect(screen.getByText('Total del gasto').parentElement!.textContent).toBe('Total del gasto₡31.000')

    await user.keyboard('{Enter}')

    const asked = await confirmation()
    expect(document.activeElement).toBe(within(asked).getByRole('button', { name: 'Editar' }))
    expect(asked.textContent).toContain('TipoAlimento')
    expect(asked.textContent).toContain(`Fecha${formatDateLong(OLD_DAY)}`)
    expect(asked.textContent).toContain('Nota2 sacos')
    expect(asked.textContent).toContain('Monto₡31.000')
    expect(posted()).toEqual([])

    // Another Enter is Editar: back to the form, with everything still there.
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(field('Monto').value).toBe('31.000')
    expect(field('Nota (opcional)').value).toBe('2 sacos')
    expect(typeOf().textContent).toContain('Alimento')
    expect(posted()).toEqual([])
  })

  it('Listo saves and goes back to Gastos on the expense’s day', async () => {
    const { router, user } = openApp(`/gastos/nuevo?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Nuevo gasto' })
    await choose(user, 'Alimento')
    await user.type(field('Monto'), '31000')
    await user.type(field('Nota (opcional)'), '  2 sacos ')

    await user.click(save())
    await listo(user)

    await waitFor(() => expect(addressOf(router)).toBe(`/gastos?fecha=${OLD_DAY}`))
    expect(posted()).toEqual([{ date: OLD_DAY, categoryId: 'c1', amount: 31000, note: '2 sacos' }])
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('"Otro" saves what it was as its note, and the confirmation says it as its type, with no Nota', async () => {
    const { user } = openApp(`/gastos/nuevo?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Nuevo gasto' })
    await choose(user, 'Otro')
    await user.type(field('¿Qué gasto fue?'), 'Gasolina{Enter}')
    expect(document.activeElement).toBe(field('Monto'))
    await user.keyboard('5000{Enter}')
    expect(document.activeElement).toBe(save())

    await user.click(save())
    const asked = await confirmation()
    expect(asked.textContent).toContain('TipoOtro: Gasolina')
    expect(asked.textContent).not.toContain('Nota')
    await listo(user)

    await waitFor(() => expect(posted()).toEqual([{ date: OLD_DAY, categoryId: 'c8', amount: 5000, note: 'Gasolina' }]))
  })

  it('from a week, a new expense starts today and Listo goes back to that week', async () => {
    const { router, user } = openApp(`/gastos/nuevo?semana=${THIS_WEEK.start}`)
    await screen.findByRole('heading', { name: 'Nuevo gasto' })
    expect(field('Fecha').value).toBe(TODAY)
    await choose(user, 'Cartones')
    await user.type(field('Monto'), '2500')

    await user.click(save())
    await listo(user)

    await waitFor(() => expect(addressOf(router)).toBe(`/gastos?semana=${THIS_WEEK.start}`))
  })

  it('what the API refuses stays in the confirmation, and Editar goes to its field', async () => {
    handlers['POST /api/expenses'] = () => json({ errors: { amount: ['Escriba el monto.'] } }, 400)
    const { user } = openApp('/gastos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo gasto' })
    await choose(user, 'Alimento')
    await user.type(field('Monto'), '1000')

    await user.click(save())
    await listo(user)

    const asked = await confirmation()
    await waitFor(() =>
      expect(within(asked).getByRole('alert').textContent).toBe('Escriba el monto. Presione Editar para corregirlo.'),
    )
    await user.click(within(asked).getByRole('button', { name: 'Editar' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('Escriba el monto.')).toBeTruthy()
    expect(document.activeElement).toBe(field('Monto'))
  })

  it('when saving fails, the confirmation stays and says what to do, and Editar keeps what was typed', async () => {
    handlers['POST /api/expenses'] = () => new Response('', { status: 500 })
    const { user } = openApp('/gastos/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo gasto' })
    await choose(user, 'Otro')
    await user.type(field('¿Qué gasto fue?'), 'Candado')
    await user.type(field('Monto'), '4500')

    await user.click(save())
    await listo(user)

    const asked = await confirmation()
    await waitFor(() =>
      expect(within(asked).getByRole('alert').textContent).toContain(
        'No se pudo guardar el gasto. Presione Listo para intentar de nuevo.',
      ),
    )
    await user.click(within(asked).getByRole('button', { name: 'Editar' }))

    expect(field('¿Qué gasto fue?').value).toBe('Candado')
    expect(field('Monto').value).toBe('4.500')
  })

  it('asks before leaving with changes, and leaves without asking when untouched', async () => {
    const { router, user } = openApp(`/gastos/nuevo?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Nuevo gasto' })
    await user.type(field('Monto'), '1000')

    await user.click(button('Cancelar'))
    const question = await screen.findByRole('alertdialog', { name: 'Tiene cambios sin guardar' })
    await user.click(within(question).getByRole('button', { name: 'No, seguir aquí' }))
    expect(addressOf(router)).toBe(`/gastos/nuevo?fecha=${OLD_DAY}`)

    await user.clear(field('Monto'))
    await user.click(button('Cancelar'))
    expect(addressOf(router)).toBe(`/gastos?fecha=${OLD_DAY}`)
  })

  it('offers to try again when the categories can not load', async () => {
    handlers['GET /api/expense-categories'] = () => new Response('', { status: 500 })
    const { user } = openApp('/gastos/nuevo')

    expect(await screen.findByText('No se pudo abrir el formulario de gastos.')).toBeTruthy()
    handlers['GET /api/expense-categories'] = () => json(CATEGORIES)
    await user.click(button('Intentar de nuevo'))

    expect(await screen.findByRole('heading', { name: 'Nuevo gasto' })).toBeTruthy()
  })
})

describe('Gastos: editing', () => {
  it('opens with its values, Borrar gasto apart, and Listo saves the change and goes back to the period', async () => {
    const { router, user } = openApp(`/gastos/e1/editar?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Editar gasto' })

    expect(typeOf().textContent).toContain('Alimento')
    expect(field('Monto').value).toBe('31.000')
    expect(field('Nota (opcional)').value).toBe('2 sacos')
    expect(button('Borrar gasto')).toBeTruthy()

    await user.clear(field('Monto'))
    await user.type(field('Monto'), '32000')
    await user.click(save())
    await listo(user)

    await waitFor(() => expect(addressOf(router)).toBe(`/gastos?fecha=${OLD_DAY}`))
    expect(callsTo('PUT', '/api/expenses/e1')[0].body).toEqual({
      date: OLD_DAY,
      categoryId: 'c1',
      amount: 32000,
      note: '2 sacos',
    })
  })

  it('"Otro" opens with what it was in "¿Qué gasto fue?"', async () => {
    openApp(`/gastos/e2/editar?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Editar gasto' })

    expect(field('¿Qué gasto fue?').value).toBe('Gasolina')
    expect(screen.queryByLabelText('Nota (opcional)')).toBeNull()
  })

  it('Borrar gasto asks first, then deletes and goes back', async () => {
    const { router, user } = openApp(`/gastos/e1/editar?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Editar gasto' })

    await user.click(button('Borrar gasto'))
    const question = await screen.findByRole('alertdialog', { name: '¿Borrar este gasto?' })
    expect(question.textContent).toContain(`¿Borrar el gasto de Alimento de ₡31.000 del ${formatDateLong(OLD_DAY)}?`)
    expect(callsTo('DELETE', '/api/expenses/e1')).toEqual([])
    await user.click(within(question).getByRole('button', { name: 'Sí, borrar' }))

    await waitFor(() => expect(addressOf(router)).toBe(`/gastos?fecha=${OLD_DAY}`))
    expect(callsTo('DELETE', '/api/expenses/e1')).toHaveLength(1)
  })

  it('keeps a retired category as an option on the expense that still has it', async () => {
    const { user } = openApp('/gastos/e3/editar')
    await screen.findByRole('heading', { name: 'Editar gasto' })

    expect(typeOf().textContent).toContain('Bandejas')
    await user.click(typeOf())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toContain('Bandejas')
  })

  it('goes back to the list when the expense no longer exists', async () => {
    handlers['GET /api/expenses/e1'] = () => new Response('', { status: 404 })
    const { router } = openApp(`/gastos/e1/editar?fecha=${OLD_DAY}`)

    await waitFor(() => expect(addressOf(router)).toBe(`/gastos?fecha=${OLD_DAY}`))
  })
})
