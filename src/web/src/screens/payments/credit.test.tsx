import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateLong, todayLocal } from '../../lib/dates'
import { routes } from '../../routes'

const TODAY = todayLocal()
const OLD_DAY = '2026-11-02'
const PAID_DAY = '2026-11-05'

const MARIA = { id: '1', name: 'María Rodríguez', phone: null, notes: null, balance: 8000 }
const MARIO = { id: '2', name: 'Mario Solís', phone: '8888-1111', notes: null, balance: 0 }
const MARIA_REF = { id: '1', name: 'María Rodríguez', isDeleted: false }

const line = (cartonType: 'A' | 'B', quantity: number, unitPrice: number) => ({
  cartonType,
  quantity,
  unitPrice,
  lineTotal: quantity * unitPrice,
})

const CREDIT_SALE = {
  id: '5',
  date: OLD_DAY,
  total: 5000,
  isCredit: true,
  customer: MARIA_REF,
  items: [line('A', 3, 1000), line('B', 1, 2000)],
  paidNow: 0,
}
const CASH_SALE = {
  id: '6',
  date: OLD_DAY,
  total: 3000,
  isCredit: false,
  customer: null,
  items: [line('A', 3, 1000)],
  paidNow: 0,
}
const PAYMENT = { id: '7', customer: MARIA_REF, date: PAID_DAY, amount: 2000, note: 'pagó la mitad', saleId: null }

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

type User = ReturnType<typeof open>['user']

const address = (router: ReturnType<typeof open>['router']) =>
  router.state.location.pathname + router.state.location.search

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label)
const alertDialog = () => screen.findByRole('alertdialog')
const picker = () => screen.findByRole('dialog', { name: '¿A quién se le fió?' })
const cash = () => button('Al contado')
const credit = () => button(/^Fiado/)
const saveSale = () => button('Guardar venta')

async function fillLine(user: User) {
  await user.click(button('Cartón de 15 huevos'))
  await user.clear(field('Cantidad'))
  await user.type(field('Cantidad'), '3')
  await user.clear(field('Precio por cartón'))
  await user.type(field('Precio por cartón'), '1000')
}

beforeEach(() => {
  calls.length = 0
  handlers = {
    'GET /api/health': () => json({ status: 'ok', time: '2026-11-04T10:00:00' }),
    'GET /api/sales': () => json({ sales: [], cashTotal: 0, creditTotal: 0 }),
    'GET /api/sales/last-prices': () => json({}),
    'GET /api/payments': () => json({ payments: [], total: 0 }),
    'GET /api/sales/5': () => json(CREDIT_SALE),
    'GET /api/sales/6': () => json(CASH_SALE),
    'POST /api/sales': ({ body }) => {
      const { date, items, isCredit, customerId, paidNow } = body as {
        date: string
        items: { quantity: number; unitPrice: number }[]
        isCredit: boolean
        customerId: string | null
        paidNow: number
      }
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      const customer = customerId
        ? { id: customerId, name: customerId === '1' ? MARIA.name : customerId === '2' ? MARIO.name : 'Ana', isDeleted: false }
        : null
      return json({ id: '9', date, total, isCredit, customer, items, paidNow }, 201)
    },
    'PUT /api/sales/5': () => json(CREDIT_SALE),
    'DELETE /api/sales/5': () => new Response(null, { status: 204 }),
    'GET /api/customers': ({ url }) => {
      const search = url.searchParams.get('search')?.toLowerCase() ?? ''
      const items = [MARIA, MARIO].filter((customer) => customer.name.toLowerCase().includes(search))
      return json({ items, owedTotal: 8000 })
    },
    'GET /api/customers/similar': () => json({ items: [], owedTotal: 0 }),
    'GET /api/customers/1': () => json(MARIA),
    'GET /api/customers/2': () => json(MARIO),
    'POST /api/customers': ({ body }) =>
      json({ id: '3', name: (body as { name: string }).name, phone: null, notes: null, balance: 0 }, 201),
    'POST /api/customers/1/payments': ({ body }) => json({ id: '8', customer: MARIA_REF, ...(body as object) }, 201),
    'GET /api/payments/7': () => json(PAYMENT),
    'PUT /api/payments/7': ({ body }) => json({ ...PAYMENT, ...(body as object) }),
    'DELETE /api/payments/7': () => new Response(null, { status: 204 }),
  }
  vi.stubGlobal('fetch', fetchMock)
})

describe('sale form: contado or fiado', () => {
  it('a new sale has neither chosen, and saving asks how it was paid', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user)

    expect(cash().getAttribute('aria-pressed')).toBe('false')
    expect(credit().getAttribute('aria-pressed')).toBe('false')

    await user.click(saveSale())

    expect(screen.getByRole('alert').textContent).toBe('¿Cómo pagó? Escoja "Al contado" o "Fiado".')
    expect(document.activeElement).toBe(cash())
    expect(callsTo('POST', '/api/sales')).toEqual([])
  })

  it('Fiado asks who, with the same search as Clientes and what each one owes', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user)

    await user.click(credit())
    const dialog = await picker()

    expect(document.activeElement).toBe(within(dialog).getByLabelText('Buscar por nombre'))
    const rows = await within(dialog).findAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['María Rodríguezdebe ₡8.000', 'Mario Solísal día'])

    await user.type(within(dialog).getByLabelText('Buscar por nombre'), 'maría')

    await waitFor(() => expect(within(dialog).getAllByRole('listitem').length).toBe(1))
    expect(callsTo('GET', '/api/customers').at(-1)!.url.searchParams.get('search')).toBe('maría')
  })

  it('picking someone marks it fiado to them, and saving sends it as a credit sale', async () => {
    const { router, user } = open(`/ventas/nueva?fecha=${OLD_DAY}`)
    await fillLine(user)

    await user.click(credit())
    await user.click(await within(await picker()).findByRole('button', { name: /María Rodríguez/ }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(credit().getAttribute('aria-pressed')).toBe('true')
    expect(credit().textContent).toBe('Fiado a María Rodríguez')
    expect(document.activeElement).toBe(saveSale())

    await user.click(saveSale())

    expect((await alertDialog()).textContent).toContain(
      `Venta fiada guardada: ₡3.000 a María Rodríguez, ${formatDateLong(OLD_DAY)}.`,
    )
    expect(callsTo('POST', '/api/sales')[0].body).toMatchObject({ isCredit: true, customerId: '1' })
    expect(address(router)).toBe(`/ventas?fecha=${OLD_DAY}`)
  })

  it('Cancelar leaves the choice as it was', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(credit())
    await user.click(within(await picker()).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(credit().getAttribute('aria-pressed')).toBe('false')
  })

  it('Enter in the search moves to the first name instead of picking it', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(credit())
    const dialog = await picker()
    await within(dialog).findAllByRole('listitem')
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: /María Rodríguez/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    await user.keyboard('{Enter}')
    expect(credit().getAttribute('aria-pressed')).toBe('true')
  })

  it('someone new can be added from the search, after the similar-name question', async () => {
    handlers['GET /api/customers/similar'] = () => json({ items: [MARIA], owedTotal: 8000 })
    const { user } = open('/ventas/nueva')
    await fillLine(user)

    await user.click(credit())
    const dialog = await picker()
    await user.type(within(dialog).getByLabelText('Buscar por nombre'), '  Ana   María ')
    await user.click(within(dialog).getByRole('button', { name: 'Agregar “Ana María” como cliente nuevo' }))

    const question = await alertDialog()
    expect(question.textContent).toContain('María Rodríguez. ¿Es otra persona?')
    await user.click(within(question).getByRole('button', { name: 'Sí, es otra persona' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(callsTo('POST', '/api/customers')[0].body).toEqual({ name: 'Ana María', phone: '', notes: '' })
    expect(credit().textContent).toBe('Fiado a Ana María')
  })

  it('Al contado after Fiado keeps the customer as who bought, and Quitar takes them off', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user)
    await user.click(credit())
    await user.click(await within(await picker()).findByRole('button', { name: /María Rodríguez/ }))

    await user.click(cash())
    expect(screen.getByText('Compró:').textContent).toBe('Compró: María Rodríguez')

    await user.click(button('Quitar a María Rodríguez de esta venta'))
    expect(screen.queryByText('Compró:')).toBeNull()
    await user.click(saveSale())

    await alertDialog()
    expect(callsTo('POST', '/api/sales')[0].body).toMatchObject({ isCredit: false, customerId: null, paidNow: 0 })
  })

  it('a fiado sale opens as fiado, and deleting it says what happens to the balance', async () => {
    const { user } = open('/ventas/5/editar')
    await screen.findByLabelText('Cantidad')

    expect(credit().getAttribute('aria-pressed')).toBe('true')
    expect(credit().textContent).toBe('Fiado a María Rodríguez')
    await waitFor(() => expect(callsTo('GET', '/api/customers/1').length).toBe(1))

    await user.click(button('Borrar venta'))

    expect((await alertDialog()).textContent).toContain(
      '¿Borrar la venta fiada de ₡5.000 a María Rodríguez? Su saldo bajará de ₡8.000 a ₡3.000.',
    )
  })

  it('what the API refuses about the balance is shown, and the form stays', async () => {
    handlers['PUT /api/sales/5'] = () => json({ message: 'María Rodríguez ya abonó ₡6.000, y con este cambio…' }, 409)
    const { router, user } = open('/ventas/5/editar')
    await screen.findByLabelText('Cantidad')

    await user.click(cash())
    await user.click(saveSale())

    expect((await alertDialog()).textContent).toContain('María Rodríguez ya abonó ₡6.000')
    expect(router.state.location.pathname).toBe('/ventas/5/editar')
  })

  it('opened from an account, it goes back to that account', async () => {
    const { router, user } = open('/ventas/5/editar?cliente=1')
    await screen.findByLabelText('Cantidad')

    await user.click(saveSale())
    await alertDialog()

    expect(address(router)).toBe('/clientes/1')
  })

  it('a sale of a deleted customer is shown, but can no longer change', async () => {
    handlers['GET /api/sales/5'] = () => json({ ...CREDIT_SALE, customer: { ...MARIA_REF, isDeleted: true } })

    open('/ventas/5/editar')

    expect((await screen.findByText(/un cliente que se borró/)).textContent).toBe(
      'Es de María Rodríguez, un cliente que se borró, así que ya no se puede cambiar.',
    )
    expect(screen.queryByRole('button', { name: 'Guardar venta' })).toBeNull()
  })
})

describe('sale form: who bought a cash sale (optional)', () => {
  const buyerLink = () => button('¿Quién compró? (opcional)')

  it('appears only after Al contado, as a quiet link, and never takes the focus or blocks saving', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user)
    expect(screen.queryByRole('button', { name: '¿Quién compró? (opcional)' })).toBeNull()

    await user.click(cash())

    expect(buyerLink()).toBeTruthy()
    expect(document.activeElement).toBe(saveSale())
    await user.click(saveSale())

    expect((await alertDialog()).textContent).toContain('Venta guardada: ₡3.000,')
    expect(callsTo('POST', '/api/sales')[0].body).toMatchObject({ isCredit: false, customerId: null, paidNow: 0 })
  })

  it('Enter from the price still goes to Guardar venta, past the optional link', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user)
    await user.click(cash())

    await user.click(field('Precio por cartón'))
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(saveSale())
    expect(callsTo('POST', '/api/sales')).toHaveLength(0)
  })

  it('picks who bought with the same search, and says it in the message', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user)
    await user.click(cash())

    await user.click(buyerLink())
    const dialog = await screen.findByRole('dialog', { name: '¿Quién compró?' })
    await user.click(await within(dialog).findByRole('button', { name: /Mario Solís/ }))

    expect(screen.getByText('Compró:').textContent).toBe('Compró: Mario Solís')
    expect(cash().getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(saveSale()))
    await user.click(saveSale())

    expect((await alertDialog()).textContent).toContain('Venta guardada: ₡3.000 a Mario Solís,')
    expect(callsTo('POST', '/api/sales')[0].body).toMatchObject({ isCredit: false, customerId: '2' })
  })

  it('Cancelar leaves it without anyone, still a cash sale', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user)
    await user.click(cash())

    await user.click(buyerLink())
    await user.click(within(await screen.findByRole('dialog', { name: '¿Quién compró?' })).getByRole('button', { name: 'Cancelar' }))

    expect(buyerLink()).toBeTruthy()
    expect(cash().getAttribute('aria-pressed')).toBe('true')
  })
})

describe('sale form: paid something with a fiado', () => {
  const paidNowField = () => field('¿Pagó algo ahora? (opcional)')

  async function fiadoToMaria(user: User) {
    await fillLine(user)
    await user.click(credit())
    await user.click(await within(await picker()).findByRole('button', { name: /María Rodríguez/ }))
  }

  it('is optional: a fiado with nothing paid saves as before', async () => {
    const { user } = open('/ventas/nueva')
    await fiadoToMaria(user)

    expect(paidNowField().value).toBe('')
    await user.click(saveSale())

    expect((await alertDialog()).textContent).not.toContain('Pagó')
    expect(callsTo('POST', '/api/sales')[0].body).toMatchObject({ isCredit: true, customerId: '1', paidNow: 0 })
  })

  it('shows what is left, Enter moves to Guardar venta, and the message says paid and still owed', async () => {
    const { user } = open('/ventas/nueva')
    await fiadoToMaria(user)

    await user.type(paidNowField(), '1000')
    expect(screen.getByText(/Queda debiendo/).textContent).toBe('Queda debiendo ₡2.000')

    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(saveSale())
    expect(callsTo('POST', '/api/sales')).toHaveLength(0)

    await user.click(saveSale())

    expect((await alertDialog()).textContent).toContain(
      `Venta fiada guardada: ₡3.000 a María Rodríguez, ${formatDateLong(TODAY)}. ` +
        'Pagó ₡1.000 y queda debiendo ₡2.000 de esta venta.',
    )
    expect(callsTo('POST', '/api/sales')[0].body).toMatchObject({ isCredit: true, customerId: '1', paidNow: 1000 })
  })

  it('refuses more than the total, without sending', async () => {
    const { user } = open('/ventas/nueva')
    await fiadoToMaria(user)

    await user.type(paidNowField(), '3001')
    await user.click(saveSale())

    expect(screen.getByText('No puede ser mayor que el total de la venta (₡3.000).')).toBeTruthy()
    expect(document.activeElement).toBe(paidNowField())
    expect(callsTo('POST', '/api/sales')).toHaveLength(0)
  })

  it('paid in full: says it is a cash sale, and one press makes it one, keeping who bought', async () => {
    const { user } = open('/ventas/nueva')
    await fiadoToMaria(user)

    await user.type(paidNowField(), '3000')
    await user.click(saveSale())

    expect(screen.getByRole('alert').textContent).toContain('Si pagó todo, es una venta al contado.')
    expect(callsTo('POST', '/api/sales')).toHaveLength(0)

    await user.click(button('Cambiar a Al contado'))

    expect(cash().getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Compró:').textContent).toBe('Compró: María Rodríguez')
    expect(screen.queryByLabelText('¿Pagó algo ahora? (opcional)')).toBeNull()
    expect(document.activeElement).toBe(saveSale())

    await user.click(saveSale())
    expect((await alertDialog()).textContent).toContain('Venta guardada: ₡3.000 a María Rodríguez,')
    expect(callsTo('POST', '/api/sales')[0].body).toMatchObject({ isCredit: false, customerId: '1', paidNow: 0 })
  })

  it('a fiado opened with what was paid shows it, and deleting says the abono goes too', async () => {
    handlers['GET /api/sales/5'] = () => json({ ...CREDIT_SALE, paidNow: 1000 })
    const { user } = open('/ventas/5/editar')
    await screen.findByLabelText('Cantidad')

    expect(paidNowField().value).toBe('1.000')
    expect(screen.getByText(/Queda debiendo/).textContent).toBe('Queda debiendo ₡4.000')
    await waitFor(() => expect(callsTo('GET', '/api/customers/1').length).toBe(1))

    await user.click(button('Borrar venta'))

    // She owes 8.000; without this sale and its abono she owes 5.000 − 1.000 less.
    expect((await alertDialog()).textContent).toContain(
      '¿Borrar la venta fiada de ₡5.000 a María Rodríguez? También se borra el abono de ₡1.000 que dio al hacerla. ' +
        'Su saldo bajará de ₡8.000 a ₡4.000.',
    )
  })
})

describe('day list', () => {
  it('names who bought a cash sale, and says when an abono came with its sale', async () => {
    handlers['GET /api/sales'] = () =>
      json({ sales: [{ ...CASH_SALE, customer: { id: '2', name: 'Mario Solís', isDeleted: false } }], cashTotal: 3000, creditTotal: 0 })
    handlers['GET /api/payments'] = () => json({ payments: [{ ...PAYMENT, note: null, saleId: '5' }], total: 2000 })
    open(`/ventas?fecha=${OLD_DAY}`)

    const rows = (await screen.findAllByRole('listitem')).map((row) => row.textContent)
    expect(rows).toEqual(['Mario Solís · 3 de 15₡3.000', 'Abono María Rodríguez · al hacer la venta₡2.000'])
  })

  it('Entró hoy is cash sales and abonos; fiado is shown apart, as owed', async () => {
    handlers['GET /api/sales'] = () => json({ sales: [CREDIT_SALE, CASH_SALE], cashTotal: 3000, creditTotal: 5000 })
    handlers['GET /api/payments'] = () => json({ payments: [PAYMENT], total: 2000 })

    open('/ventas')

    expect((await screen.findByText('Entró hoy')).parentElement!.textContent).toBe('Entró hoy₡5.000')
    expect(screen.getByText(/^Contado/).textContent).toBe(
      'Contado ₡3.000 · Abonos ₡2.000 · Fiado (por cobrar) ₡5.000',
    )
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Fiado María Rodríguez · 3 de 15 · 1 de 30₡5.000',
      '3 de 15₡3.000',
      'Abono María Rodríguez₡2.000',
    ])
  })

  it('with only cash sales, there is just the one total', async () => {
    handlers['GET /api/sales'] = () => json({ sales: [CASH_SALE], cashTotal: 3000, creditTotal: 0 })

    open(`/ventas?fecha=${OLD_DAY}`)

    expect((await screen.findByText('Entró')).parentElement!.textContent).toBe('Entró₡3.000')
    expect(screen.queryByText(/^Contado/)).toBeNull()
  })

  it('a day with only an abono lists it, and it opens to come back to the same day', async () => {
    handlers['GET /api/payments'] = () => json({ payments: [PAYMENT], total: 2000 })
    const { router, user } = open(`/ventas?fecha=${PAID_DAY}`)

    await user.click(await screen.findByRole('button', { name: /Abono/ }))

    expect(address(router)).toBe(`/clientes/1/abonos/7/editar?fecha=${PAID_DAY}`)
    await user.click(await screen.findByRole('button', { name: 'Volver' }))
    expect(address(router)).toBe(`/ventas?fecha=${PAID_DAY}`)
  })

  it('a deleted customer is named as such', async () => {
    const gone = { ...CREDIT_SALE, customer: { ...MARIA_REF, isDeleted: true } }
    handlers['GET /api/sales'] = () => json({ sales: [gone], cashTotal: 0, creditTotal: 5000 })

    open('/ventas')

    expect((await screen.findByRole('listitem')).textContent).toContain('María Rodríguez (borrado)')
  })
})

describe('abono form', () => {
  it('shows who and what they owe, and what they will owe after it', async () => {
    const { user } = open('/clientes/1/abonos/nuevo')

    await screen.findByLabelText('Monto del abono')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Abono de María Rodríguez')
    expect(screen.getByText('Debe ₡8.000.')).toBeTruthy()
    expect(document.activeElement).toBe(field('Monto del abono'))
    expect(button('Hoy').getAttribute('aria-pressed')).toBe('true')

    await user.type(field('Monto del abono'), '3000')
    expect(screen.getByText(/Después del abono/).textContent).toBe('Después del abono: debe ₡5.000')

    await user.clear(field('Monto del abono'))
    await user.type(field('Monto del abono'), '8000')
    expect(screen.getByText(/Después del abono/).textContent).toBe('Después del abono: queda al día')

    await user.type(field('Monto del abono'), '0')
    expect(screen.getByText('Es más de lo que debe.')).toBeTruthy()
  })

  it('refuses an empty amount or more than is owed, without sending', async () => {
    const { user } = open('/clientes/1/abonos/nuevo')
    await screen.findByLabelText('Monto del abono')

    await user.click(button('Guardar abono'))
    expect(screen.getByText('Escriba el monto del abono.')).toBeTruthy()

    await user.type(field('Monto del abono'), '9000')
    await user.click(button('Guardar abono'))
    expect(screen.getByText('María Rodríguez debe ₡8.000. El abono no puede ser mayor.')).toBeTruthy()
    expect(document.activeElement).toBe(field('Monto del abono'))
    expect(callsTo('POST', '/api/customers/1/payments')).toEqual([])
  })

  it('Enter goes amount → note → Guardar abono, and only the button saves', async () => {
    const { router, user } = open('/clientes/1/abonos/nuevo')
    await screen.findByLabelText('Monto del abono')

    await user.keyboard('3000{Enter}')
    expect(document.activeElement).toBe(field('Nota (opcional)'))
    await user.keyboard(' pagó la mitad {Enter}')
    expect(document.activeElement).toBe(button('Guardar abono'))
    expect(callsTo('POST', '/api/customers/1/payments')).toEqual([])

    await user.keyboard('{Enter}')

    expect((await alertDialog()).textContent).toContain(
      'Abono guardado: ₡3.000 de María Rodríguez. Ahora debe ₡5.000.',
    )
    expect(callsTo('POST', '/api/customers/1/payments')[0].body).toEqual({
      date: TODAY,
      amount: 3000,
      note: 'pagó la mitad',
    })
    expect(address(router)).toBe('/clientes/1')
  })

  it('Ayer works as in a sale', async () => {
    const { user } = open('/clientes/1/abonos/nuevo')
    await screen.findByLabelText('Monto del abono')

    await user.click(button('Ayer'))
    await user.type(field('Monto del abono'), '8000')
    await user.click(button('Guardar abono'))

    expect((await alertDialog()).textContent).toContain('Ahora está al día.')
    expect((callsTo('POST', '/api/customers/1/payments')[0].body as { date: string }).date).not.toBe(TODAY)
  })

  it('leaving with a typed amount asks first', async () => {
    const { router, user } = open('/clientes/1/abonos/nuevo')
    await screen.findByLabelText('Monto del abono')

    await user.type(field('Monto del abono'), '3000')
    await user.click(button('Volver'))

    expect((await alertDialog()).textContent).toContain('¿Salir sin guardar?')
    expect(router.state.location.pathname).toBe('/clientes/1/abonos/nuevo')
  })

  it('someone who owes nothing has nothing to pay', async () => {
    open('/clientes/2/abonos/nuevo')

    expect(await screen.findByText('Mario Solís está al día: no debe nada.')).toBeTruthy()
    expect(screen.queryByLabelText('Monto del abono')).toBeNull()
  })

  it('editing allows up to what was owed without it, and saves over it', async () => {
    const { router, user } = open('/clientes/1/abonos/7/editar')
    await screen.findByLabelText('Monto del abono')

    expect(field('Monto del abono').value).toBe('2.000')
    expect(field('Nota (opcional)').value).toBe('pagó la mitad')

    await user.clear(field('Monto del abono'))
    await user.type(field('Monto del abono'), '10001')
    await user.click(button('Guardar abono'))
    expect(screen.getByText('Sin este abono, María Rodríguez debería ₡10.000. El abono no puede ser mayor.')).toBeTruthy()

    await user.clear(field('Monto del abono'))
    await user.type(field('Monto del abono'), '10000')
    await user.click(button('Guardar abono'))

    expect((await alertDialog()).textContent).toContain('Ahora está al día.')
    expect(callsTo('PUT', '/api/payments/7')[0].body).toEqual({ date: PAID_DAY, amount: 10000, note: 'pagó la mitad' })
    expect(address(router)).toBe('/clientes/1')
  })

  it('deleting asks with what it does to the balance', async () => {
    const { router, user } = open('/clientes/1/abonos/7/editar')
    await screen.findByLabelText('Monto del abono')

    await user.click(button('Borrar abono'))
    const confirm = await alertDialog()
    expect(confirm.textContent).toContain(
      `¿Borrar el abono de ₡2.000 de María Rodríguez del ${formatDateLong(PAID_DAY)}? ` +
        'Su saldo subirá de ₡8.000 a ₡10.000.',
    )

    await user.click(within(confirm).getByRole('button', { name: 'Sí, borrar' }))

    expect((await alertDialog()).textContent).toContain('Abono borrado. Ahora debe ₡10.000.')
    expect(callsTo('DELETE', '/api/payments/7').length).toBe(1)
    expect(address(router)).toBe('/clientes/1')
  })

  it('an abono of a deleted customer is shown, but can no longer change', async () => {
    handlers['GET /api/payments/7'] = () => json({ ...PAYMENT, customer: { ...MARIA_REF, isDeleted: true } })

    open('/clientes/1/abonos/7/editar')

    expect(await screen.findByText(/un cliente que se borró/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Guardar abono' })).toBeNull()
    expect(callsTo('GET', '/api/customers/1')).toEqual([])
  })
})

describe('account statement', () => {
  const STATEMENT = {
    id: '1',
    name: 'María Rodríguez',
    phone: null,
    balance: 8000,
    entries: [
      { kind: 'payment', id: '7', date: PAID_DAY, amount: 2000, balance: 8000, note: 'pagó la mitad', items: null },
      { kind: 'sale', id: '5', date: '2026-11-04', amount: 5000, balance: 10000, note: null, items: CREDIT_SALE.items },
      { kind: 'sale', id: '4', date: OLD_DAY, amount: 5000, balance: 5000, note: null, items: [line('B', 2, 2500)] },
    ],
    cashPurchases: [],
  }

  beforeEach(() => {
    handlers['GET /api/customers/1/statement'] = () => json(STATEMENT)
  })

  it('shows the balance first, then every fiado and abono, newest first, with the balance after each', async () => {
    open('/clientes/1')

    expect((await screen.findByText('Debe')).parentElement!.textContent).toBe('Debe₡8.000')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('María Rodríguez')
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'jue 5 nov 2026Abono · pagó la mitad−₡2.000Debe ₡8.000',
      'mié 4 nov 2026Fiado · 3 de 15 · 1 de 30+₡5.000Debe ₡10.000',
      'lun 2 nov 2026Fiado · 2 de 30+₡5.000Debe ₡5.000',
    ])
  })

  it('Anotar abono opens the abono form, which comes back here', async () => {
    const { router, user } = open('/clientes/1')

    await user.click(await screen.findByRole('button', { name: 'Anotar abono' }))

    expect(router.state.location.pathname).toBe('/clientes/1/abonos/nuevo')
    await user.click(await screen.findByRole('button', { name: 'Volver' }))
    expect(router.state.location.pathname).toBe('/clientes/1')
  })

  it('a fiado opens its sale and an abono opens the abono', async () => {
    const { router, user } = open('/clientes/1')

    await user.click(await screen.findByRole('button', { name: /3 de 15/ }))
    expect(address(router)).toBe('/ventas/5/editar?cliente=1')

    await user.click(await screen.findByRole('button', { name: 'Volver' }))
    await user.click(await screen.findByRole('button', { name: /pagó la mitad/ }))
    expect(address(router)).toBe('/clientes/1/abonos/7/editar')
  })

  it('someone up to date shows Al día and has no Anotar abono', async () => {
    handlers['GET /api/customers/1/statement'] = () => json({ ...STATEMENT, balance: 0, entries: [] })

    open('/clientes/1')

    expect(await screen.findByText('Al día')).toBeTruthy()
    expect(screen.getByText('María Rodríguez no tiene fiados ni abonos.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Anotar abono' })).toBeNull()
    expect(button('Editar cliente')).toBeTruthy()
  })

  it('shows cash purchases apart, under their own heading, never in the account', async () => {
    handlers['GET /api/customers/1/statement'] = () =>
      json({
        ...STATEMENT,
        cashPurchases: [
          { id: '9', date: PAID_DAY, total: 13500, items: [line('B', 3, 4500)] },
          { id: '8', date: OLD_DAY, total: 2500, items: [line('A', 1, 2500)] },
        ],
      })
    const { router, user } = open('/clientes/1')

    const account = await screen.findByRole('list', { name: 'Fiados y abonos' })
    expect(within(account).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Debe').parentElement!.textContent).toBe('Debe₡8.000')

    const cash = screen.getByRole('region', { name: 'Compras al contado' })
    expect(within(cash).getByText('No cuentan en lo que debe. 2 compras · ₡16.000')).toBeTruthy()
    expect(within(cash).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'jue 5 nov 2026' + '3 de 30' + '₡13.500',
      'lun 2 nov 2026' + '1 de 15' + '₡2.500',
    ])

    await user.click(within(cash).getByRole('button', { name: /3 de 30/ }))
    expect(address(router)).toBe('/ventas/9/editar?cliente=1')
  })

  it('has no cash purchases section when there are none', async () => {
    open('/clientes/1')

    await screen.findByRole('list', { name: 'Fiados y abonos' })
    expect(screen.queryByRole('region', { name: 'Compras al contado' })).toBeNull()
  })

  it('an abono paid as a fiado was made says so, and opens as a note that leads to its sale', async () => {
    handlers['GET /api/customers/1/statement'] = () =>
      json({
        ...STATEMENT,
        entries: [{ ...STATEMENT.entries[0], note: null, saleId: '5' }, ...STATEMENT.entries.slice(1)],
      })
    handlers['GET /api/payments/7'] = () =>
      json({ ...PAYMENT, note: null, saleId: '5' })
    const { router, user } = open('/clientes/1')

    await user.click(await screen.findByRole('button', { name: /Abono al hacer la venta/ }))

    expect(
      await screen.findByText('Lo pagó al hacer una venta fiada, así que se cambia o se borra desde esa venta.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Guardar abono' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Borrar abono' })).toBeNull()

    await user.click(button('Abrir la venta'))
    expect(address(router)).toBe('/ventas/5/editar?cliente=1')
  })

  it('a customer who no longer exists goes back to the list', async () => {
    handlers['GET /api/customers/1/statement'] = () => json({}, 404)

    const { router } = open('/clientes/1')

    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes'))
    expect((await alertDialog()).textContent).toContain('Este cliente ya no existe.')
  })
})

describe('customer list: who owes', () => {
  it('shows what everyone owes, and Solo los que deben leaves out those up to date', async () => {
    const { user } = open('/clientes')

    await screen.findAllByRole('listitem')
    expect(screen.getByText(/Por cobrar en total/).textContent).toBe('Por cobrar en total: ₡8.000')

    await user.click(button('Solo los que deben'))

    expect(button('Solo los que deben').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'María RodríguezSin teléfonoDebe ₡8.000',
    ])
  })

  it('when nobody owes, says so and offers to see everyone', async () => {
    handlers['GET /api/customers'] = () => json({ items: [MARIO], owedTotal: 0 })
    const { user } = open('/clientes')
    await screen.findAllByRole('listitem')

    expect(screen.queryByText(/Por cobrar en total/)).toBeNull()
    await user.click(button('Solo los que deben'))
    expect(screen.getByText('Nadie debe nada. Todos están al día.')).toBeTruthy()

    await user.click(button('Ver todos'))
    expect(screen.getAllByRole('listitem').length).toBe(1)
  })
})
