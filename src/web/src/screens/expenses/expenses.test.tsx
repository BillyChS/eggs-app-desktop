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

// As the API lists them: alphabetically, "Otro" last, with how many expenses use each.
const CATEGORIES = [
  { ...category('c1', 'Alimento'), expenseCount: 12 },
  { ...category('c4', 'Burucha'), expenseCount: 0 },
  { ...category('c5', 'Cartones'), expenseCount: 3 },
  { ...category('c3', 'Desparasitantes'), expenseCount: 1 },
  { ...category('c7', 'Equipo'), expenseCount: 0 },
  { ...category('c6', 'Plásticos/Envoltorios'), expenseCount: 2 },
  { ...category('c2', 'Vitaminas'), expenseCount: 1 },
  { ...category('c8', 'Otro', true), expenseCount: 1 },
]
const ALIMENTO = category('c1', 'Alimento')
const PLASTICOS = category('c6', 'Plásticos/Envoltorios')
const VITAMINAS = category('c2', 'Vitaminas')
const OTRO = category('c8', 'Otro', true)

const FEED = { id: 'e1', date: OLD_DAY, category: ALIMENTO, amount: 31000, note: '2 sacos' }
// Saved under "Otro" before "Otro" made types of its own: its note says what it was.
const GAS = { id: 'e2', date: OLD_DAY, category: OTRO, amount: 5000, note: 'Gasolina' }
const OLD_TRAYS = { id: 'e3', date: OLD_DAY, category: category('c9', 'Bandejas', false, true), amount: 2500, note: null }
const BAGS = { id: 'e4', date: OLD_DAY, category: PLASTICOS, amount: 3000, note: null }
const VITS = { id: 'e5', date: OLD_DAY, category: VITAMINAS, amount: 4000, note: 'Para los pollitos' }

const OLD_DAY_LIST = { expenses: [GAS, BAGS, VITS, FEED], total: 43000, byCategory: [] }
const NOTHING = { expenses: [], total: 0, byCategory: [] }

const api = fakeApi()
const { handlers, callsTo } = api

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const pressed = (name: string | RegExp) => button(name).getAttribute('aria-pressed')
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
const footer = () => screen.getByText(/^Total ₡/).parentElement!.textContent

/** The one popup open: there's never a second one on top. */
const popup = () => {
  const open = screen.getAllByRole('alertdialog')
  expect(open).toHaveLength(1)
  return open[0]
}
const inPopup = () => within(popup())
const field = (label: string) => inPopup().getByLabelText<HTMLInputElement>(label)
const typeOf = () => inPopup().getByRole('button', { name: /^¿Qué tipo de gasto\?/ })
const save = () => inPopup().getByRole('button', { name: 'Guardar gasto' })
const posted = () => callsTo('POST', '/api/expenses').map((call) => call.body)

async function openNew(user: User) {
  await user.click(screen.getAllByRole('button', { name: 'Nuevo gasto' })[0])
  await screen.findByRole('alertdialog', { name: 'Nuevo gasto' })
  await waitFor(() => expect(document.activeElement).toBe(typeOf()))
}

async function choose(user: User, option: string) {
  await user.click(typeOf())
  await user.click(screen.getByRole('option', { name: option }))
}

async function confirm(user: User) {
  await user.click(save())
  return screen.findByRole('alertdialog', { name: 'Ventana de confirmación' })
}

async function listo(user: User) {
  await user.click(within(popup()).getByRole('button', { name: 'Listo' }))
}

const echoExpense: Reply = ({ body }) => {
  const { categoryId, newCategory, note, ...rest } = body as { categoryId?: string; newCategory?: string; note: string }
  const chosen = newCategory
    ? category('c10', newCategory)
    : [...CATEGORIES, OLD_TRAYS.category].find((candidate) => candidate.id === categoryId)
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
    'PUT /api/expenses/e1': echoExpense,
    'PUT /api/expenses/e2': echoExpense,
    'PUT /api/expenses/e3': echoExpense,
    'DELETE /api/expenses/e1': () => noContent(),
    'DELETE /api/expenses/e2': () => noContent(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Gastos: the page', () => {
  it('opens on today: one card with the total and how many, the toolbar, and an empty list that offers a new one', async () => {
    const { user } = openApp('/gastos')

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
    expect(screen.queryByText('En qué se gastó')).toBeNull()

    // Even with nothing in the period, the types can be managed.
    expect(screen.getByRole('searchbox', { name: 'Buscar gasto' })).toBeTruthy()
    expect(button('Filtrar')).toBeTruthy()
    expect(button('Tipos de gasto')).toBeTruthy()

    const empty = screen.getByRole('region', { name: 'Lista de gastos' })
    await user.click(within(empty).getByRole('button', { name: 'Nuevo gasto' }))
    expect(await screen.findByRole('alertdialog', { name: 'Nuevo gasto' })).toBeTruthy()
  })

  it('lists the day: Tipo (an old "Otro" by what it was), Nota, Monto, and a footer with how many and the total', async () => {
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
      ['Plásticos/Envoltorios', '', '₡3.000'],
      ['Vitaminas', 'Para los pollitos', '₡4.000'],
      ['Alimento', '2 sacos', '₡31.000'],
    ])
    expect(footer()).toBe('4 gastosTotal ₡43.000')
    expect(card('Gastado ese día')).toBe('Gastado ese día₡43.0004 gastos')
  })

  it('Buscar gasto filters by type or note as it is typed, ignoring case and accents, and the footer says how many of all', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')
    const search = screen.getByRole('searchbox', { name: 'Buscar gasto' })

    await user.type(search, 'PLASTICOS')
    expect(rows()).toEqual([['Plásticos/Envoltorios', '', '₡3.000']])
    expect(footer()).toBe('1 de 4 gastosTotal ₡3.000')

    await user.clear(search)
    await user.type(search, 'póllitos')
    expect(rows().map((row) => row[0])).toEqual(['Vitaminas'])

    // An old "Otro" by what it was.
    await user.clear(search)
    await user.type(search, 'gasolina')
    expect(rows().map((row) => row[0])).toEqual(['GasolinaOtro'])

    // The card is still the whole period.
    expect(card('Gastado ese día')).toBe('Gastado ese día₡43.0004 gastos')
  })

  it('with nothing that matches, says so, and Quitar filtros shows everything again', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')

    await user.type(screen.getByRole('searchbox', { name: 'Buscar gasto' }), 'candado')

    expect(screen.getByText('No hay gastos que coincidan.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    await user.click(button('Quitar filtros'))

    expect(rows()).toHaveLength(4)
    expect(screen.getByRole<HTMLInputElement>('searchbox', { name: 'Buscar gasto' }).value).toBe('')
    expect(footer()).toBe('4 gastosTotal ₡43.000')
  })

  it('Filtrar offers the types of the period with how many, and ticking some shows only those', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')

    await user.click(button('Filtrar'))
    const filter = screen.getByRole('group', { name: 'Filtrar por tipo' })
    const boxes = within(filter).getAllByRole('checkbox')
    expect(boxes.map((box) => box.closest('label')!.textContent)).toEqual([
      'Alimento1 gasto',
      'Plásticos/Envoltorios1 gasto',
      'Vitaminas1 gasto',
      'Otro1 gasto',
    ])
    expect(document.activeElement).toBe(boxes[0])

    await user.click(boxes[0])
    await user.click(within(filter).getByRole('checkbox', { name: /^Vitaminas/ }))

    expect(button('Filtrar (2)').getAttribute('aria-expanded')).toBe('true')
    expect(rows().map((row) => row[0])).toEqual(['Vitaminas', 'Alimento'])
    expect(footer()).toBe('2 de 4 gastosTotal ₡35.000')

    // With the search too: only what both leave.
    await user.type(screen.getByRole('searchbox', { name: 'Buscar gasto' }), 'sacos')
    expect(rows().map((row) => row[0])).toEqual(['Alimento'])

    await user.click(button('Filtrar (2)'))
    await user.click(within(screen.getByRole('group', { name: 'Filtrar por tipo' })).getByRole('button', { name: 'Quitar filtros' }))
    expect(button('Filtrar')).toBeTruthy()
    expect(rows().map((row) => row[0])).toEqual(['Alimento'])
  })

  it('Filtrar closes with Esc, back on its button', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')

    await user.click(button('Filtrar'))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('group', { name: 'Filtrar por tipo' })).toBeNull()
    expect(document.activeElement).toBe(button('Filtrar'))
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
    expect(card('Gastado este mes')).toContain('₡43.000')
    const [weekday, day, month] = rows()[0][0]!.split(' ')
    expect(weekday).toBe('lun')
    expect(day).toBe('2')
    expect(month).toBe('nov')
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

  it('the old addresses of the expense pages go to Gastos, on the period they carried', async () => {
    const created = openApp(`/gastos/nuevo?fecha=${OLD_DAY}`)
    await waitFor(() => expect(addressOf(created.router)).toBe(`/gastos?fecha=${OLD_DAY}`))
    created.router.dispose()

    const edited = openApp(`/gastos/e1/editar?semana=${LAST_WEEK.start}`)
    await waitFor(() => expect(addressOf(edited.router)).toBe(`/gastos?semana=${LAST_WEEK.start}`))
  })
})

describe('Gastos: the Nuevo gasto popup', () => {
  it('opens over the page on its day, on the type, which starts at "Elija uno", with the types in order', async () => {
    const { router, user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')

    await openNew(user)

    expect(addressOf(router)).toBe(`/gastos?fecha=${OLD_DAY}`)
    expect(typeOf().textContent).toContain('Elija uno')
    expect(field('Fecha').value).toBe(OLD_DAY)
    expect(popup().textContent).toContain(formatDateLong(OLD_DAY))
    expect(inPopup().queryByRole('button', { name: 'Borrar gasto' })).toBeNull()
    expect(inPopup().queryByLabelText('¿Qué gasto fue?')).toBeNull()
    expect(field('Nota (opcional)')).toBeTruthy()

    await user.click(typeOf())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(
      CATEGORIES.map((candidate) => candidate.name),
    )
  })

  it('from a week, starts today', async () => {
    const { user } = openApp(`/gastos?semana=${THIS_WEEK.start}`)
    await screen.findByText('No hay gastos registrados esta semana.')

    await openNew(user)

    expect(field('Fecha').value).toBe(TODAY)
  })

  it('"Otro" shows "¿Qué gasto fue?" next to the type, with focus in it; another type hides and clears it', async () => {
    const { user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')
    await openNew(user)

    await choose(user, 'Otro')

    await waitFor(() => expect(document.activeElement).toBe(field('¿Qué gasto fue?')))
    // The note is for every type now, "Otro" too.
    expect(field('Nota (opcional)')).toBeTruthy()
    await user.type(field('¿Qué gasto fue?'), 'Gasolina')

    await choose(user, 'Alimento')

    expect(inPopup().queryByLabelText('¿Qué gasto fue?')).toBeNull()
    expect(document.activeElement).toBe(field('Monto'))

    await choose(user, 'Otro')
    await waitFor(() => expect(field('¿Qué gasto fue?').value).toBe(''))
  })

  it('asks for what is missing next to each field, with focus on the first, and shows no confirmation', async () => {
    const { user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')
    await openNew(user)

    await user.click(save())

    expect(inPopup().getByText('Elija el tipo de gasto.')).toBeTruthy()
    expect(inPopup().getByText('Escriba el monto.')).toBeTruthy()
    expect(document.activeElement).toBe(typeOf())

    await choose(user, 'Otro')
    await user.type(field('Monto'), '5000')
    await user.click(save())

    expect(inPopup().getByText('Escriba qué gasto fue.')).toBeTruthy()
    expect(document.activeElement).toBe(field('¿Qué gasto fue?'))

    await user.type(field('¿Qué gasto fue?'), ' OTRO ')
    await user.click(save())

    expect(inPopup().getByText('Escriba qué gasto fue, no «Otro».')).toBeTruthy()
    expect(screen.queryByRole('alertdialog', { name: 'Ventana de confirmación' })).toBeNull()
    expect(posted()).toEqual([])
  })

  it('Enter moves on, type → Monto → Nota → Guardar gasto, which shows the confirmation in the same popup', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')
    await openNew(user)

    await choose(user, 'Alimento')
    expect(document.activeElement).toBe(field('Monto'))
    await user.keyboard('31000{Enter}')
    expect(document.activeElement).toBe(field('Nota (opcional)'))
    await user.keyboard('2 sacos{Enter}')
    expect(document.activeElement).toBe(save())

    await user.keyboard('{Enter}')

    const asked = await screen.findByRole('alertdialog', { name: 'Ventana de confirmación' })
    // Not a second dialog on top: the same popup, showing the confirmation in place of the fields.
    expect(popup()).toBe(asked)
    await waitFor(() => expect(document.activeElement).toBe(within(asked).getByRole('button', { name: 'Editar' })))
    expect(asked.textContent).toContain('TipoAlimento')
    expect(asked.textContent).toContain(`Fecha${formatDateLong(OLD_DAY)}`)
    expect(asked.textContent).toContain('Nota2 sacos')
    expect(asked.textContent).toContain('Monto₡31.000')
    expect(posted()).toEqual([])

    // Another Enter is Editar: back to the fields, with everything still there.
    await user.keyboard('{Enter}')
    expect(popup().textContent).toContain('Nuevo gasto')
    expect(field('Monto').value).toBe('31.000')
    expect(field('Nota (opcional)').value).toBe('2 sacos')
    expect(typeOf().textContent).toContain('Alimento')
    expect(posted()).toEqual([])
  })

  it('Listo saves, closes the popup and loads the list again, on the same period', async () => {
    const { router, user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')
    await openNew(user)
    await choose(user, 'Alimento')
    await user.type(field('Monto'), '31000')
    await user.type(field('Nota (opcional)'), '  2 sacos ')

    await confirm(user)
    const before = callsTo('GET', '/api/expenses').length
    await listo(user)

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(posted()).toEqual([{ date: OLD_DAY, categoryId: 'c1', amount: 31000, note: '2 sacos' }])
    expect(addressOf(router)).toBe(`/gastos?fecha=${OLD_DAY}`)
    await waitFor(() => expect(callsTo('GET', '/api/expenses').length).toBeGreaterThan(before))
  })

  it('saved on another day than the one shown, the page goes to that day', async () => {
    const { router, user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')
    await openNew(user)
    await user.click(inPopup().getByRole('button', { name: 'Hoy' }))
    await choose(user, 'Cartones')
    await user.type(field('Monto'), '2500')

    await confirm(user)
    await listo(user)

    await waitFor(() => expect(addressOf(router)).toBe(`/gastos?fecha=${TODAY}`))
  })

  it('"Otro" saves what it was as a new type, and the confirmation says it is new', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')
    await openNew(user)
    await choose(user, 'Otro')
    await user.type(field('¿Qué gasto fue?'), '  gasolina   súper {Enter}')
    expect(document.activeElement).toBe(field('Monto'))
    await user.keyboard('5000{Enter}')
    await user.keyboard('Para el carro')

    const asked = await confirm(user)
    expect(asked.textContent).toContain('TipoGasolina súper (tipo nuevo)')
    expect(asked.textContent).toContain('NotaPara el carro')
    await listo(user)

    await waitFor(() =>
      expect(posted()).toEqual([
        { date: OLD_DAY, amount: 5000, note: 'Para el carro', newCategory: 'Gasolina súper' },
      ]),
    )

    // Next time, it's in the list like any other type.
    handlers['GET /api/expense-categories'] = () =>
      json([...CATEGORIES.slice(0, 5), { ...category('c10', 'Gasolina súper'), expenseCount: 1 }, ...CATEGORIES.slice(5)])
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await openNew(user)
    await user.click(typeOf())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toContain('Gasolina súper')
  })

  it('"Otro" with the name of a type there already says that type, not a new one', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')
    await openNew(user)
    await choose(user, 'Otro')
    await user.type(field('¿Qué gasto fue?'), 'PLASTICOS/envoltorios')
    await user.type(field('Monto'), '1500')

    const asked = await confirm(user)

    expect(asked.textContent).toContain('TipoPlásticos/Envoltorios')
    expect(asked.textContent).not.toContain('tipo nuevo')
  })

  it('what the API refuses stays in the confirmation, and Editar goes to its field', async () => {
    handlers['POST /api/expenses'] = () =>
      json({ errors: { newCategory: ['El nombre no puede tener más de 40 letras.'] } }, 400)
    const { user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')
    await openNew(user)
    await choose(user, 'Otro')
    await user.type(field('¿Qué gasto fue?'), 'Gasolina')
    await user.type(field('Monto'), '1000')

    const asked = await confirm(user)
    await listo(user)

    await waitFor(() =>
      expect(within(asked).getByRole('alert').textContent).toBe(
        'El nombre no puede tener más de 40 letras. Presione Editar para corregirlo.',
      ),
    )
    await user.click(within(asked).getByRole('button', { name: 'Editar' }))

    expect(inPopup().getByText('El nombre no puede tener más de 40 letras.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(field('¿Qué gasto fue?')))
  })

  it('when saving fails, the confirmation stays and says what to do, and Editar keeps what was typed', async () => {
    handlers['POST /api/expenses'] = () => new Response('', { status: 500 })
    const { user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')
    await openNew(user)
    await choose(user, 'Otro')
    await user.type(field('¿Qué gasto fue?'), 'Candado')
    await user.type(field('Monto'), '4500')

    const asked = await confirm(user)
    await listo(user)

    await waitFor(() =>
      expect(within(asked).getByRole('alert').textContent).toContain(
        'No se pudo guardar el gasto. Presione Listo para intentar de nuevo.',
      ),
    )
    await user.click(within(asked).getByRole('button', { name: 'Editar' }))

    expect(field('¿Qué gasto fue?').value).toBe('Candado')
    expect(field('Monto').value).toBe('4.500')
  })

  it('Cancelar with changes asks in the same popup; untouched, it just closes', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')
    await openNew(user)
    await user.type(field('Monto'), '1000')

    await user.click(inPopup().getByRole('button', { name: 'Cancelar' }))
    const question = await screen.findByRole('alertdialog', { name: 'Tiene cambios sin guardar' })
    expect(popup()).toBe(question)
    await user.click(within(question).getByRole('button', { name: 'No, seguir aquí' }))
    expect(field('Monto').value).toBe('1.000')

    await user.click(inPopup().getByRole('button', { name: 'Cancelar' }))
    await user.click(within(popup()).getByRole('button', { name: 'Sí, salir' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    await openNew(user)
    await user.click(inPopup().getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('offers to try again when the types can not load', async () => {
    handlers['GET /api/expense-categories'] = () => new Response('', { status: 500 })
    const { user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')

    await user.click(screen.getAllByRole('button', { name: 'Nuevo gasto' })[0])
    expect(await inPopup().findByText('No se pudo abrir el formulario de gastos.')).toBeTruthy()
    handlers['GET /api/expense-categories'] = () => json(CATEGORIES)
    await user.click(inPopup().getByRole('button', { name: 'Intentar de nuevo' }))

    await waitFor(() => expect(document.activeElement).toBe(typeOf()))
  })
})

describe('Gastos: the Editar gasto popup', () => {
  it('opens with its values and Borrar gasto, and Listo saves the change and closes', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')

    await user.click(button('Editar el gasto de Alimento'))
    await screen.findByRole('alertdialog', { name: 'Editar gasto' })
    await waitFor(() => expect(typeOf().textContent).toContain('Alimento'))
    expect(field('Monto').value).toBe('31.000')
    expect(field('Nota (opcional)').value).toBe('2 sacos')
    expect(inPopup().getByRole('button', { name: 'Borrar gasto' })).toBeTruthy()

    await user.clear(field('Monto'))
    await user.type(field('Monto'), '32000')
    await confirm(user)
    await listo(user)

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(callsTo('PUT', '/api/expenses/e1')[0].body).toEqual({
      date: OLD_DAY,
      categoryId: 'c1',
      amount: 32000,
      note: '2 sacos',
    })
  })

  it('an old "Otro" opens with what it was in "¿Qué gasto fue?", and saving makes it a type', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')

    await user.click(button('Editar el gasto de Gasolina'))
    await screen.findByRole('alertdialog', { name: 'Editar gasto' })
    await waitFor(() => expect(field('¿Qué gasto fue?').value).toBe('Gasolina'))
    expect(field('Nota (opcional)').value).toBe('')

    await confirm(user)
    await listo(user)

    await waitFor(() => expect(callsTo('PUT', '/api/expenses/e2')).toHaveLength(1))
    expect(callsTo('PUT', '/api/expenses/e2')[0].body).toEqual({
      date: OLD_DAY,
      amount: 5000,
      note: '',
      newCategory: 'Gasolina',
    })
  })

  it('Borrar gasto asks in the same popup; Sí, borrar deletes it and closes', async () => {
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')
    await user.click(button('Editar el gasto de Alimento'))
    await screen.findByRole('alertdialog', { name: 'Editar gasto' })
    await waitFor(() => expect(typeOf()).toBeTruthy())

    await user.click(inPopup().getByRole('button', { name: 'Borrar gasto' }))
    const question = await screen.findByRole('alertdialog', { name: '¿Borrar este gasto?' })
    expect(popup()).toBe(question)
    expect(question.textContent).toContain(`¿Borrar el gasto de Alimento de ₡31.000 del ${formatDateLong(OLD_DAY)}?`)
    await waitFor(() => expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'No, cancelar' })))
    expect(callsTo('DELETE', '/api/expenses/e1')).toEqual([])

    await user.click(within(question).getByRole('button', { name: 'Sí, borrar' }))

    await waitFor(() => expect(callsTo('DELETE', '/api/expenses/e1')).toHaveLength(1))
    expect(await screen.findByText('Gasto borrado.')).toBeTruthy()
    expect(screen.queryByRole('alertdialog', { name: 'Editar gasto' })).toBeNull()
  })

  it('keeps a retired type as an option on the expense that still has it', async () => {
    handlers['GET /api/expenses'] = () => json({ expenses: [OLD_TRAYS], total: 2500, byCategory: [] })
    const { user } = openApp('/gastos')
    await screen.findByRole('table')

    await user.click(button('Editar el gasto de Bandejas'))
    await screen.findByRole('alertdialog', { name: 'Editar gasto' })

    await waitFor(() => expect(typeOf().textContent).toContain('Bandejas'))
    await user.click(typeOf())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toContain('Bandejas')
  })

  it('says so when the expense no longer exists, and loads the list again', async () => {
    handlers['PUT /api/expenses/e1'] = () => new Response('', { status: 404 })
    const { user } = openApp(`/gastos?fecha=${OLD_DAY}`)
    await screen.findByRole('table')
    await user.click(button('Editar el gasto de Alimento'))
    await screen.findByRole('alertdialog', { name: 'Editar gasto' })
    await waitFor(() => expect(typeOf()).toBeTruthy())

    await confirm(user)
    await listo(user)

    expect(await screen.findByText('Este gasto ya no existe.')).toBeTruthy()
    expect(screen.queryByRole('alertdialog', { name: /gasto|confirmación/ })).toBeNull()
  })
})

describe('Gastos: the Tipos de gasto popup', () => {
  async function openTypes(user: User) {
    await user.click(button('Tipos de gasto'))
    await screen.findByRole('list', { name: 'Tipos de gasto' })
  }

  const listed = () =>
    within(screen.getByRole('list', { name: 'Tipos de gasto' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent)

  it('lists the types in order with how many gastos use each; every one but "Otro" can be deleted', async () => {
    const { user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')

    await openTypes(user)

    expect(listed()).toEqual([
      'Alimento12 gastosEliminar',
      'Burucha0 gastosEliminar',
      'Cartones3 gastosEliminar',
      'Desparasitantes1 gastoEliminar',
      'Equipo0 gastosEliminar',
      'Plásticos/Envoltorios2 gastosEliminar',
      'Vitaminas1 gastoEliminar',
      'Otro1 gastoSiempre está',
    ])
    expect(screen.queryByRole('button', { name: 'Eliminar el tipo Otro' })).toBeNull()
    expect(document.activeElement).toBe(inPopup().getByRole('button', { name: 'Cerrar' }))

    await user.click(inPopup().getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('Agregar tipo checks the name, then adds it in its place in the list', async () => {
    handlers['POST /api/expense-categories'] = ({ body }) =>
      json({ ...category('c10', (body as { name: string }).name), expenseCount: 0 }, 201)
    const { user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')
    await openTypes(user)
    const name = field('Agregar tipo')
    const add = () => inPopup().getByRole('button', { name: 'Agregar' })

    await user.click(add())
    expect(inPopup().getByText('Escriba el nombre del tipo.')).toBeTruthy()

    await user.type(name, 'ALIMENTO')
    await user.click(add())
    expect(inPopup().getByText('Ya existe el tipo Alimento.')).toBeTruthy()

    await user.clear(name)
    await user.type(name, 'otro')
    await user.click(add())
    expect(inPopup().getByText('Escriba qué gasto fue, no «Otro».')).toBeTruthy()
    expect(callsTo('POST', '/api/expense-categories')).toEqual([])

    // Enter moves on to Agregar, and adds nothing by itself.
    await user.clear(name)
    await user.type(name, '  gasolina {Enter}')
    expect(document.activeElement).toBe(add())
    expect(callsTo('POST', '/api/expense-categories')).toEqual([])

    await user.click(add())

    await waitFor(() => expect(callsTo('POST', '/api/expense-categories')[0]?.body).toEqual({ name: 'Gasolina' }))
    expect(await inPopup().findByText('Se agregó el tipo Gasolina.')).toBeTruthy()
    expect(listed()[5]).toBe('Gasolina0 gastosEliminar')
    expect(listed().at(-1)).toBe('Otro1 gastoSiempre está')
    expect(name.value).toBe('')
  })

  it('Eliminar asks in the same popup, and Sí, eliminar retires the type', async () => {
    handlers['DELETE /api/expense-categories/c2'] = () => noContent()
    const { user } = openApp('/gastos')
    await screen.findByText('No hay gastos registrados hoy.')
    await openTypes(user)

    await user.click(inPopup().getByRole('button', { name: 'Eliminar el tipo Vitaminas' }))
    const question = await screen.findByRole('alertdialog', { name: '¿Eliminar este tipo?' })
    expect(popup()).toBe(question)
    expect(question.textContent).toContain('¿Eliminar el tipo Vitaminas? Los gastos que ya lo usan lo mantienen.')
    await waitFor(() => expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'No, cancelar' })))

    await user.click(within(question).getByRole('button', { name: 'No, cancelar' }))
    expect(listed()).toContain('Vitaminas1 gastoEliminar')
    expect(callsTo('DELETE', '/api/expense-categories/c2')).toEqual([])

    await user.click(inPopup().getByRole('button', { name: 'Eliminar el tipo Vitaminas' }))
    await user.click(within(popup()).getByRole('button', { name: 'Sí, eliminar' }))

    await waitFor(() => expect(callsTo('DELETE', '/api/expense-categories/c2')).toHaveLength(1))
    expect(await inPopup().findByText('Se eliminó el tipo Vitaminas.')).toBeTruthy()
    expect(listed().some((item) => item!.startsWith('Vitaminas'))).toBe(false)
  })
})
