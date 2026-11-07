import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateLong, todayLocal, yesterdayLocal } from '../../lib/dates'
import { routes } from '../../routes'

const TODAY = todayLocal()
const OLD_DAY = '2026-11-02'

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

const FEED = { id: 'e1', date: OLD_DAY, category: CATEGORIES[0], amount: 31000, note: '2 sacos' }
const GAS = { id: 'e2', date: OLD_DAY, category: CATEGORIES[7], amount: 5000, note: 'Gasolina' }
const OLD_TRAYS = { id: 'e3', date: OLD_DAY, category: category('c9', 'Bandejas', false, true), amount: 2500, note: null }

interface Call {
  method: string
  url: URL
  body: unknown
}

type Reply = (call: Call) => Response | Promise<Response>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const calls: Call[] = []
let handlers: Record<string, Reply>

const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
  const url = new URL(String(input), 'http://app')
  const method = init?.method ?? 'GET'
  const call = { method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined }
  calls.push(call)
  return handlers[`${method} ${url.pathname}`]?.(call) ?? json({})
})

const callsTo = (method: string, path: string) =>
  calls.filter((call) => call.method === method && call.url.pathname === path)

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

const address = (router: ReturnType<typeof open>['router']) =>
  router.state.location.pathname + router.state.location.search

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label)
const alertDialog = () => screen.findByRole('alertdialog')
const categoryButtons = () =>
  within(screen.getByRole('group', { name: '¿En qué gastó?' })).getAllByRole('button')
const save = () => button('Guardar gasto')

const echoExpense: Reply = ({ body }) => {
  const { categoryId, note, ...rest } = body as { categoryId: string; note: string }
  const chosen = [...CATEGORIES, OLD_TRAYS.category].find((candidate) => candidate.id === categoryId)
  return json({ id: 'e9', category: chosen, note: note || null, ...rest }, 201)
}

beforeEach(() => {
  calls.length = 0
  handlers = {
    'GET /api/health': () => json({ status: 'ok', time: '2026-11-04T10:00:00' }),
    'GET /api/expense-categories': () => json(CATEGORIES),
    'GET /api/expenses': ({ url }) =>
      url.searchParams.get('from') === OLD_DAY
        ? json({ expenses: [GAS, FEED], total: 36000 })
        : json({ expenses: [], total: 0 }),
    'POST /api/expenses': echoExpense,
    'GET /api/expenses/e1': () => json(FEED),
    'GET /api/expenses/e3': () => json(OLD_TRAYS),
    'PUT /api/expenses/e1': echoExpense,
    'PUT /api/expenses/e3': echoExpense,
    'DELETE /api/expenses/e1': () => new Response(null, { status: 204 }),
  }
  vi.stubGlobal('fetch', fetchMock)
})

describe('Gastos list', () => {
  it('shows the day with its total, and opens an expense to edit it', async () => {
    const { router, user } = open(`/gastos?fecha=${OLD_DAY}`)

    const list = await screen.findByRole('list', { name: 'Gastos del día' })
    const rows = within(list).getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual(['Otro · Gasolina₡5.000', 'Alimento · 2 sacos₡31.000'])
    expect(screen.getByText('Gastado').nextSibling?.textContent).toBe('₡36.000')
    expect(callsTo('GET', '/api/expenses')[0].url.search).toBe(`?from=${OLD_DAY}&to=${OLD_DAY}`)

    await user.click(rows[1])
    expect(address(router)).toBe(`/gastos/e1/editar?fecha=${OLD_DAY}`)
  })

  it('says when there is nothing today, with "Gastado hoy" at ₡0', async () => {
    open('/gastos')

    expect(await screen.findByText('Todavía no hay gastos hoy.')).toBeTruthy()
    expect(screen.getByText('Gastado hoy').nextSibling?.textContent).toBe('₡0')
  })

  it('goes to another day with Ayer, and starts a new expense on it', async () => {
    const { router, user } = open('/gastos')
    await screen.findByText('Todavía no hay gastos hoy.')

    await user.click(button('Ayer'))
    expect(await screen.findByText('No hay gastos este día.')).toBeTruthy()
    expect(button('Ayer').getAttribute('aria-pressed')).toBe('true')

    await user.click(button('Nuevo gasto'))
    expect(address(router)).toBe(`/gastos/nuevo?fecha=${yesterdayLocal()}`)
    expect(await screen.findByRole('heading', { name: 'Nuevo gasto' })).toBeTruthy()
    expect(button('Ayer').getAttribute('aria-pressed')).toBe('true')
  })

  it('offers to try again when the list fails to load', async () => {
    let fail = true
    handlers['GET /api/expenses'] = () => (fail ? json({}, 500) : json({ expenses: [], total: 0 }))
    const { user } = open('/gastos')

    expect((await screen.findByRole('alert')).textContent).toBe('No se pudieron cargar los gastos.')

    fail = false
    await user.click(button('Intentar de nuevo'))
    expect(await screen.findByText('Todavía no hay gastos hoy.')).toBeTruthy()
  })
})

describe('expense form', () => {
  it('shows every category with none chosen, and focus on the first', async () => {
    open('/gastos/nuevo')

    await waitFor(() => expect(document.activeElement?.textContent).toBe('Alimento'))
    expect(categoryButtons().map((candidate) => candidate.textContent)).toEqual(CATEGORIES.map(({ name }) => name))
    expect(categoryButtons().every((candidate) => candidate.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(field('Nota (opcional)')).toBeTruthy()
    expect(button('Hoy').getAttribute('aria-pressed')).toBe('true')
  })

  it('saves a new expense from the keyboard: category, amount, note, then the button', async () => {
    const { router, user } = open('/gastos/nuevo')
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Alimento'))

    await user.keyboard('{Enter}')
    expect(button('Alimento').getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(field('Monto'))

    await user.keyboard('31000{Enter}')
    expect(document.activeElement).toBe(field('Nota (opcional)'))

    await user.keyboard('2 sacos{Enter}')
    expect(document.activeElement).toBe(save())
    expect(callsTo('POST', '/api/expenses')).toHaveLength(0)

    await user.keyboard('{Enter}')

    const dialog = await alertDialog()
    expect(dialog.textContent).toContain(`Gasto guardado: Alimento ₡31.000, ${formatDateLong(TODAY)}.`)
    expect(callsTo('POST', '/api/expenses')[0].body).toEqual({
      date: TODAY,
      categoryId: 'c1',
      amount: 31000,
      note: '2 sacos',
    })
    expect(address(router)).toBe(`/gastos?fecha=${TODAY}`)
  })

  it('asks for a category before saving', async () => {
    const { user } = open('/gastos/nuevo')
    await screen.findByRole('group', { name: '¿En qué gastó?' })

    await user.type(field('Monto'), '1000')
    await user.click(save())

    expect((await screen.findByRole('alert')).textContent).toBe('Escoja en qué gastó.')
    expect(document.activeElement).toBe(button('Alimento'))
    expect(callsTo('POST', '/api/expenses')).toHaveLength(0)

    await user.click(button('Cartones'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks for the amount', async () => {
    const { user } = open('/gastos/nuevo')
    await screen.findByRole('group', { name: '¿En qué gastó?' })

    await user.click(button('Cartones'))
    await user.click(save())

    expect(await screen.findByText('Escriba el monto del gasto.')).toBeTruthy()
    expect(document.activeElement).toBe(field('Monto'))
    expect(callsTo('POST', '/api/expenses')).toHaveLength(0)
  })

  it('makes the note required for "Otro", and not once another category is chosen', async () => {
    const { user } = open('/gastos/nuevo')
    await screen.findByRole('group', { name: '¿En qué gastó?' })

    await user.click(button('Otro'))
    expect(field('¿En qué gastó? (obligatorio)')).toBeTruthy()
    await user.type(field('Monto'), '5000')
    await user.type(field('¿En qué gastó? (obligatorio)'), '   ')
    await user.click(save())

    expect(await screen.findByText('Escriba en qué gastó.')).toBeTruthy()
    expect(document.activeElement).toBe(field('¿En qué gastó? (obligatorio)'))
    expect(callsTo('POST', '/api/expenses')).toHaveLength(0)

    await user.click(button('Equipo'))
    expect(field('Nota (opcional)')).toBeTruthy()
    expect(screen.queryByText('Escriba en qué gastó.')).toBeNull()

    await user.click(button('Otro'))
    await user.clear(field('¿En qué gastó? (obligatorio)'))
    await user.type(field('¿En qué gastó? (obligatorio)'), 'Gasolina')
    await user.click(save())

    expect((await alertDialog()).textContent).toContain('Gasto guardado: Otro ₡5.000')
    expect(callsTo('POST', '/api/expenses')[0].body).toMatchObject({ categoryId: 'c8', note: 'Gasolina' })
  })

  it('shows what the API refuses next to its field', async () => {
    handlers['POST /api/expenses'] = () =>
      json({ errors: { categoryId: ['Esa categoría ya no existe. Escoja otra.'] } }, 400)
    const { user } = open('/gastos/nuevo')
    await screen.findByRole('group', { name: '¿En qué gastó?' })

    await user.click(button('Vitaminas'))
    await user.type(field('Monto'), '1500')
    await user.click(save())

    expect((await screen.findByRole('alert')).textContent).toBe('Esa categoría ya no existe. Escoja otra.')
    expect(document.activeElement).toBe(button('Alimento'))
  })

  it('asks before leaving with changes, and leaves without asking when untouched', async () => {
    const { router, user } = open(`/gastos/nuevo?fecha=${OLD_DAY}`)
    await screen.findByRole('group', { name: '¿En qué gastó?' })

    await user.click(button('Burucha'))
    await user.click(button('Volver'))

    const dialog = await alertDialog()
    expect(within(dialog).getByText('¿Salir sin guardar?')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Sí, salir' }))
    expect(address(router)).toBe(`/gastos?fecha=${OLD_DAY}`)

    await user.click(await screen.findByRole('button', { name: 'Nuevo gasto' }))
    await screen.findByRole('group', { name: '¿En qué gastó?' })
    await user.click(button('Volver'))
    expect(address(router)).toBe(`/gastos?fecha=${OLD_DAY}`)
  })

  it('offers to try again when the categories fail to load', async () => {
    handlers['GET /api/expense-categories'] = () => json({}, 500)
    open('/gastos/nuevo')

    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo abrir el formulario de gastos.')
    expect(button('Intentar de nuevo')).toBeTruthy()
  })
})

describe('editing an expense', () => {
  it('opens with its values, saves the change, and goes back to its day', async () => {
    const { router, user } = open(`/gastos/e1/editar?fecha=${OLD_DAY}`)

    expect(await screen.findByRole('heading', { name: 'Editar gasto' })).toBeTruthy()
    expect(button('Alimento').getAttribute('aria-pressed')).toBe('true')
    expect(field('Monto').value).toBe('31.000')
    expect(field('Nota (opcional)').value).toBe('2 sacos')

    await user.click(button('Vitaminas'))
    await user.click(save())

    expect((await alertDialog()).textContent).toContain(`Gasto guardado: Vitaminas ₡31.000, ${formatDateLong(OLD_DAY)}.`)
    expect(callsTo('PUT', '/api/expenses/e1')[0].body).toEqual({
      date: OLD_DAY,
      categoryId: 'c2',
      amount: 31000,
      note: '2 sacos',
    })
    expect(address(router)).toBe(`/gastos?fecha=${OLD_DAY}`)
  })

  it('deletes only after confirming, saying what it was', async () => {
    const { router, user } = open(`/gastos/e1/editar?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Editar gasto' })

    await user.click(button('Borrar gasto'))
    let dialog = await alertDialog()
    expect(dialog.textContent).toContain(`¿Borrar el gasto de Alimento de ₡31.000 del ${formatDateLong(OLD_DAY)}?`)
    await user.click(within(dialog).getByRole('button', { name: 'No, cancelar' }))
    expect(callsTo('DELETE', '/api/expenses/e1')).toHaveLength(0)

    await user.click(button('Borrar gasto'))
    dialog = await alertDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Sí, borrar' }))

    expect((await alertDialog()).textContent).toContain('Gasto borrado.')
    expect(callsTo('DELETE', '/api/expenses/e1')).toHaveLength(1)
    expect(address(router)).toBe(`/gastos?fecha=${OLD_DAY}`)
  })

  it('keeps a retired category as a button on the expense that still has it', async () => {
    const { user } = open(`/gastos/e3/editar?fecha=${OLD_DAY}`)
    await screen.findByRole('heading', { name: 'Editar gasto' })

    expect(categoryButtons().map((candidate) => candidate.textContent)).toEqual([
      ...CATEGORIES.map(({ name }) => name),
      'Bandejas',
    ])
    expect(button('Bandejas').getAttribute('aria-pressed')).toBe('true')

    await user.clear(field('Monto'))
    await user.type(field('Monto'), '3000')
    await user.click(save())

    expect((await alertDialog()).textContent).toContain('Gasto guardado: Bandejas ₡3.000')
    expect(callsTo('PUT', '/api/expenses/e3')[0].body).toMatchObject({ categoryId: 'c9', amount: 3000 })
  })

  it('goes back to the list when the expense no longer exists', async () => {
    handlers['GET /api/expenses/e1'] = () => json({}, 404)
    const { router } = open(`/gastos/e1/editar?fecha=${OLD_DAY}`)

    expect((await alertDialog()).textContent).toContain('Este gasto ya no existe.')
    expect(address(router)).toBe(`/gastos?fecha=${OLD_DAY}`)
  })
})
