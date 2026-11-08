import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateLong, todayLocal } from '../../lib/dates'
import { addressOf, EMPTY_SUMMARY, fakeApi, json, noContent, openApp, type User } from '../../test/api'

const TODAY = todayLocal()
const OLD_DAY = '2026-01-05'

const line = (cartonType: 'A' | 'B', quantity: number, unitPrice: number) => ({
  cartonType,
  quantity,
  unitPrice,
  lineTotal: quantity * unitPrice,
})

const MARIA = { id: '1', name: 'María Rodríguez', phone: '8888-1020', notes: null, balance: 8000 }
const MARIO = { id: '2', name: 'Mario Solís', phone: null, notes: null, balance: 0 }
const MARIA_REF = { id: '1', name: 'María Rodríguez', isDeleted: false, phone: '8888-1020' }

const CASH_SALE = {
  id: '5',
  date: OLD_DAY,
  total: 5000,
  isCredit: false,
  customer: null,
  items: [line('A', 3, 1000), line('B', 1, 2000)],
  paidNow: 0,
  owed: 0,
}
const CREDIT_SALE = { ...CASH_SALE, id: '6', isCredit: true, customer: MARIA_REF, paidNow: 1000, owed: 4000 }

const api = fakeApi()
const { handlers, callsTo } = api

interface SentSale {
  date: string
  items: { cartonType: string; quantity: number; unitPrice: number }[]
  isCredit: boolean
  customerId: string | null
  paidNow: number
  newCustomer?: { name: string; phone: string }
}

const posted = () => callsTo('POST', '/api/sales').map((call) => call.body as SentSale)

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label)
const paidWith = () => button(/^¿Cómo pagó?/)
const typeOf = (number = 0) => button(number ? new RegExp(`^Tipo de cartón, línea ${number}`) : /^Tipo de cartón/)
const save = () => button('Guardar venta')
const searchBox = () => screen.getByRole('searchbox', { name: 'Cliente' })
const results = () => screen.getByRole('group', { name: 'Resultados de clientes' })
const chosen = () => screen.getByText(/^Elegido:/).textContent
const dialog = () => screen.findByRole('alertdialog')
const total = () => screen.getByText('Total de la venta').parentElement!.textContent

async function choose(user: User, dropdown: HTMLElement, option: string) {
  await user.click(dropdown)
  await user.click(screen.getByRole('option', { name: option }))
}

/** One line: the carton, a quantity and a price, typed over what's there. */
async function fillLine(user: User, carton = 'Cartón de 15 huevos', quantity = '3', price = '1000', number = 0) {
  const suffix = number ? `, línea ${number}` : ''
  await choose(user, typeOf(number), carton)
  await user.clear(field(`Cantidad${suffix}`))
  await user.type(field(`Cantidad${suffix}`), quantity)
  await user.clear(field(`Precio por cartón${suffix}`))
  await user.type(field(`Precio por cartón${suffix}`), price)
}

beforeEach(() => {
  api.reset({
    'GET /api/health': () => json({ status: 'ok', time: '2026-11-04T10:00:00' }),
    'GET /api/sales': () => json({ sales: [], cashTotal: 0, creditTotal: 0 }),
    'GET /api/payments': () => json({ payments: [], total: 0 }),
    'GET /api/reports/summary': () => json(EMPTY_SUMMARY),
    'GET /api/sales/last-prices': () => json({}),
    'GET /api/sales/5': () => json(CASH_SALE),
    'GET /api/sales/6': () => json(CREDIT_SALE),
    'POST /api/sales': ({ body }) => {
      const sent = body as SentSale
      const saleTotal = sent.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      const customer = sent.newCustomer
        ? { id: '3', name: sent.newCustomer.name, isDeleted: false }
        : sent.customerId
          ? { id: sent.customerId, name: sent.customerId === '1' ? MARIA.name : MARIO.name, isDeleted: false }
          : null
      return json({ id: '9', ...sent, total: saleTotal, customer, owed: 0 }, 201)
    },
    'PUT /api/sales/5': () => json(CASH_SALE),
    'PUT /api/sales/6': () => json(CREDIT_SALE),
    'DELETE /api/sales/6': () => noContent(),
    'GET /api/customers': ({ url }) => {
      const search = url.searchParams.get('search')?.toLowerCase() ?? ''
      const items = [MARIA, MARIO].filter((customer) => customer.name.toLowerCase().includes(search))
      return json({ items, owedTotal: 8000 })
    },
    'GET /api/customers/similar': () => json({ items: [], owedTotal: 0 }),
    'GET /api/customers/1': () => json(MARIA),
  })
})

afterEach(() => {
  delete window.chrome
  vi.restoreAllMocks()
})

describe('sale form: order and start', () => {
  it('asks in order: Fecha, ¿Cómo pagó?, the cartons, Cliente, then the total and the buttons', async () => {
    openApp('/ventas/nueva')
    await screen.findByText('Agregar cliente nuevo')

    const inOrder = [
      field('Fecha'),
      paidWith(),
      typeOf(),
      field('Cantidad'),
      field('Precio por cartón'),
      button('Agregar otro cartón'),
      searchBox(),
      results(),
      screen.getByText('Total de la venta'),
      button('Cancelar'),
      save(),
    ]

    inOrder.slice(1).forEach((element, index) => {
      expect(inOrder[index].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
    // Only for a fiado.
    expect(screen.queryByLabelText('¿Pagó algo ahora? (opcional)')).toBeNull()
  })

  it('a new sale starts on the day given, with no payment chosen, nobody chosen, and focus on ¿Cómo pagó?', async () => {
    openApp(`/ventas/nueva?fecha=${OLD_DAY}`)

    expect(field('Fecha').value).toBe(OLD_DAY)
    expect(screen.getByText(formatDateLong(OLD_DAY)!)).toBeTruthy()
    expect(paidWith().textContent).toBe('Elija uno')
    expect(chosen()).toBe('Elegido: ninguno')
    expect(document.activeElement).toBe(paidWith())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Nueva venta')
  })

  it('the sidebar stays, with Ventas marked', () => {
    openApp('/ventas/nueva')

    const nav = screen.getByRole('navigation', { name: 'Menú principal' })
    expect(within(nav).getByRole('button', { name: 'Ventas' }).getAttribute('aria-current')).toBe('page')
  })
})

describe('sale form: Enter', () => {
  it('cash: ¿Cómo pagó? → type → quantity → price → Guardar venta, and only the button saves', async () => {
    const { router, user } = openApp('/ventas/nueva')

    await user.keyboard('{Enter}')
    expect(screen.getByRole('listbox')).toBeTruthy()
    await user.keyboard('{Enter}')
    expect(paidWith().textContent).toBe('Al contado')
    expect(document.activeElement).toBe(typeOf())

    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    expect(typeOf().textContent).toBe('Cartón de 30 huevos')
    expect(document.activeElement).toBe(field('Cantidad'))

    await user.keyboard('2{Enter}')
    expect(document.activeElement).toBe(field('Precio por cartón'))

    // Cash starts with Cliente sin nombre, so the price goes straight to the button.
    await user.keyboard('4500{Enter}')
    expect(chosen()).toBe('Elegido: Cliente sin nombre')
    expect(document.activeElement).toBe(save())
    expect(posted()).toEqual([])

    await user.keyboard('{Enter}')

    expect((await dialog()).textContent).toContain(`Venta guardada: ₡9.000, ${formatDateLong(TODAY)}.`)
    expect(posted()).toEqual([
      { date: TODAY, items: [{ cartonType: 'B', quantity: 2, unitPrice: 4500 }], isCredit: false, customerId: null, paidNow: 0 },
    ])
    expect(addressOf(router)).toBe(`/ventas?fecha=${TODAY}`)
  })

  it('fiado: price → ¿Pagó algo ahora? → Cliente → the first name, which is picked by Enter, then Guardar venta', async () => {
    const { router, user } = openApp('/ventas/nueva')

    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    expect(paidWith().textContent).toBe('Fiado')
    await user.keyboard('{Enter}{Enter}3{Enter}1000{Enter}')
    expect(document.activeElement).toBe(field('¿Pagó algo ahora? (opcional)'))

    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(searchBox())

    await screen.findByText('María Rodríguez')
    await user.keyboard('{Enter}')
    // Not Cliente sin nombre, which a fiado can't be: the first name.
    expect(document.activeElement).toBe(button(/^María Rodríguez/))
    expect(posted()).toEqual([])

    await user.keyboard('{Enter}')
    expect(chosen()).toBe('Elegido: María Rodríguez')
    expect(document.activeElement).toBe(save())

    await user.keyboard('{Enter}')

    expect((await dialog()).textContent).toContain('Venta fiada guardada: ₡3.000 a María Rodríguez')
    expect(posted()[0]).toMatchObject({ isCredit: true, customerId: '1', paidNow: 0 })
    expect(addressOf(router)).toBe(`/ventas?fecha=${TODAY}&pestana=fiado`)
  })

  it('the date moves on to ¿Cómo pagó?, and never saves', async () => {
    const { user } = openApp('/ventas/nueva')

    field('Fecha').focus()
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(paidWith())
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(posted()).toEqual([])
  })

  it('the price of a line moves on to the next line’s type', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await user.click(button('Agregar otro cartón'))

    field('Precio por cartón, línea 1').focus()
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(typeOf(2))
  })

  it('holding Enter down does not run through the fields', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    field('Cantidad').focus()

    await user.keyboard('{Enter>5/}')

    expect(document.activeElement).toBe(field('Precio por cartón'))
  })

  it('held down on Guardar venta it is cancelled before it can press the button', () => {
    openApp('/ventas/nueva')
    const event = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })

    save().dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })
})

describe('sale form: ¿Cómo pagó?', () => {
  it('saving without it asks for it, with focus on it, and sends nothing', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)

    await user.click(save())

    expect(screen.getByText('¿Cómo pagó? Escoja "Al contado" o "Fiado".')).toBeTruthy()
    expect(document.activeElement).toBe(paidWith())
    expect(posted()).toEqual([])
  })

  it('Fiado shows ¿Pagó algo ahora?, and Al contado takes it away again', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)

    await choose(user, paidWith(), 'Fiado')
    expect(field('¿Pagó algo ahora? (opcional)')).toBeTruthy()
    expect(screen.getByText('Queda debiendo').parentElement!.textContent).toBe('Queda debiendo₡3.000')

    await choose(user, paidWith(), 'Al contado')
    expect(screen.queryByLabelText('¿Pagó algo ahora? (opcional)')).toBeNull()
  })
})

describe('sale form: Cliente', () => {
  it('a cash sale starts on Cliente sin nombre, first in the list, and saves with no customer', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)

    await choose(user, paidWith(), 'Al contado')

    const rows = within(results()).getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Agregar cliente nuevo',
      'Cliente sin nombrePara ventas al contado de paso',
      'María Rodríguez8888-1020 · debe ₡8.000',
      'Mario SolísSin teléfono · al día',
    ])
    expect(rows[1].getAttribute('aria-pressed')).toBe('true')

    await user.click(save())
    expect(posted()[0].customerId).toBeNull()
  })

  it('a fiado can’t be Cliente sin nombre: it’s turned off, says why, and saving asks for a name', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Al contado')

    await choose(user, paidWith(), 'Fiado')

    const noName = within(results()).getByRole('button', { name: /^Cliente sin nombre/ }) as HTMLButtonElement
    expect(noName.disabled).toBe(true)
    expect(noName.textContent).toContain('No se puede fiar a un cliente sin nombre')
    expect(chosen()).toBe('Elegido: ninguno')

    await user.click(save())

    expect(screen.getByText('Para fiar hay que elegir un cliente con nombre.')).toBeTruthy()
    expect(document.activeElement).toBe(searchBox())
    expect(posted()).toEqual([])
  })

  it('picking someone sends them, and they stay when switching to Al contado', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Fiado')

    await user.click(await screen.findByRole('button', { name: /^María Rodríguez/ }))
    expect(chosen()).toBe('Elegido: María Rodríguez')
    await choose(user, paidWith(), 'Al contado')
    expect(chosen()).toBe('Elegido: María Rodríguez')

    await user.click(save())

    expect((await dialog()).textContent).toContain('Venta guardada: ₡3.000 a María Rodríguez')
    expect(posted()[0]).toMatchObject({ isCredit: false, customerId: '1' })
  })

  it('searching hides Cliente sin nombre, and with no match offers to add that name', async () => {
    const { user } = openApp('/ventas/nueva')
    await screen.findByText('María Rodríguez')

    await user.type(searchBox(), 'mar')
    await waitFor(() => expect(within(results()).queryByText('Mario Solís')).toBeTruthy())
    expect(within(results()).queryByText('Cliente sin nombre')).toBeNull()
    expect(within(results()).getAllByRole('button')[0].textContent).toBe('Agregar cliente nuevo')

    await user.clear(searchBox())
    await user.type(searchBox(), '  Ana   Solano ')

    expect(await screen.findByText('No se encontró ningún cliente con «Ana Solano».')).toBeTruthy()
    expect(button('Agregar «Ana Solano» como cliente nuevo')).toBeTruthy()
  })

  it('someone new opens a smaller panel, with the name from the search, and is sent with the sale', async () => {
    const { router, user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Fiado')
    await user.type(searchBox(), 'Ana')
    await user.click(await screen.findByRole('button', { name: 'Agregar «Ana» como cliente nuevo' }))

    const panel = screen.getByRole('group', { name: 'Cliente nuevo' })
    expect(within(panel).getByLabelText<HTMLInputElement>('Nombre').value).toBe('Ana')
    expect(within(panel).getByText('Se guarda en Clientes junto con la venta.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByLabelText('Nombre')))

    await user.type(within(panel).getByLabelText('Nombre'), ' Solano{Enter}')
    expect(document.activeElement).toBe(within(panel).getByLabelText('Teléfono (opcional)'))
    await user.type(within(panel).getByLabelText('Teléfono (opcional)'), '8888-1234{Enter}')
    expect(document.activeElement).toBe(save())
    expect(chosen()).toBe('Elegido: Ana Solano')

    await user.click(save())

    expect((await dialog()).textContent).toContain('Venta fiada guardada: ₡3.000 a Ana Solano')
    expect(posted()[0]).toMatchObject({
      isCredit: true,
      customerId: null,
      newCustomer: { name: 'Ana Solano', phone: '8888-1234' },
    })
    expect(callsTo('POST', '/api/customers')).toEqual([])
    expect(addressOf(router)).toBe(`/ventas?fecha=${TODAY}&pestana=fiado`)
  })

  it('someone new needs a name', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Al contado')
    await user.click(button('Agregar cliente nuevo'))

    await user.click(save())

    expect(screen.getByText('Escriba el nombre del cliente.')).toBeTruthy()
    expect(posted()).toEqual([])
  })

  it('a name like someone’s asks first: No, revisar sends nothing; Sí, es otra persona saves', async () => {
    handlers['GET /api/customers/similar'] = () => json({ items: [MARIA], owedTotal: 0 })
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Al contado')
    await user.click(button('Agregar cliente nuevo'))
    await user.type(screen.getByLabelText('Nombre'), 'Maria Rodriguez')

    await user.click(save())
    let question = await dialog()
    expect(question.textContent).toContain('María Rodríguez (8888-1020). ¿Es otra persona?')
    await user.click(within(question).getByRole('button', { name: 'No, revisar' }))
    expect(posted()).toEqual([])

    await user.click(save())
    question = await dialog()
    await user.click(within(question).getByRole('button', { name: 'Sí, es otra persona' }))

    await waitFor(() => expect(posted()).toHaveLength(1))
    expect(posted()[0].newCustomer).toEqual({ name: 'Maria Rodriguez', phone: '' })
  })

  it('Cancelar on someone new goes back to Cliente sin nombre for a cash sale', async () => {
    const { user } = openApp('/ventas/nueva')
    await choose(user, paidWith(), 'Al contado')
    await user.click(button('Agregar cliente nuevo'))

    await user.click(within(screen.getByRole('group', { name: 'Cliente nuevo' })).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('group', { name: 'Cliente nuevo' })).toBeNull()
    expect(chosen()).toBe('Elegido: Cliente sin nombre')
  })

  it('what the API refuses about someone new shows on their field', async () => {
    handlers['POST /api/sales'] = () =>
      json({ errors: { 'newCustomer.phone': ['El teléfono no puede tener más de 30 caracteres.'] } }, 400)
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Al contado')
    await user.click(button('Agregar cliente nuevo'))
    await user.type(screen.getByLabelText('Nombre'), 'Ana')

    await user.click(save())

    expect(await screen.findByText('El teléfono no puede tener más de 30 caracteres.')).toBeTruthy()
  })
})

describe('sale form: lines', () => {
  it('every line stays editable, the total adds them up, and all are sent in order', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user, 'Cartón de 15 huevos', '3', '1000')
    await user.click(button('Agregar otro cartón'))
    expect(document.activeElement).toBe(typeOf(2))
    await fillLine(user, 'Cartón de 30 huevos', '1', '4500', 2)

    expect(total()).toBe('Total de la venta₡7.500')

    // The first line can still change.
    await user.clear(field('Cantidad, línea 1'))
    await user.type(field('Cantidad, línea 1'), '4')
    expect(total()).toBe('Total de la venta₡8.500')

    await choose(user, paidWith(), 'Al contado')
    await user.click(save())

    expect(posted()[0].items).toEqual([
      { cartonType: 'A', quantity: 4, unitPrice: 1000 },
      { cartonType: 'B', quantity: 1, unitPrice: 4500 },
    ])
  })

  it('a line left untouched is not part of the sale, and adding goes to it instead of another', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await user.click(button('Agregar otro cartón'))
    await user.click(button('Agregar otro cartón'))

    expect(screen.getAllByRole('button', { name: /^Tipo de cartón/ })).toHaveLength(2)

    await choose(user, paidWith(), 'Al contado')
    await user.click(save())
    expect(posted()[0].items).toHaveLength(1)
  })

  it('a blank form shows what is missing on the line, with focus there, and sends nothing', async () => {
    const { user } = openApp('/ventas/nueva')
    await choose(user, paidWith(), 'Al contado')

    await user.click(save())

    expect(screen.getByText('Escoja el tipo de cartón.')).toBeTruthy()
    expect(screen.getByText('Escriba el precio por cartón.')).toBeTruthy()
    expect(document.activeElement).toBe(typeOf())
    expect(posted()).toEqual([])
  })

  it('Quitar on a filled line asks first, naming it', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await user.click(button('Agregar otro cartón'))
    await fillLine(user, 'Cartón de 30 huevos', '1', '4500', 2)

    await user.click(button('Quitar la línea 1'))
    const question = await dialog()
    expect(question.textContent).toContain('¿Quitar 3 de 15 huevos × ₡1.000 = ₡3.000?')

    await user.click(within(question).getByRole('button', { name: 'No, cancelar' }))
    expect(total()).toBe('Total de la venta₡7.500')

    await user.click(button('Quitar la línea 1'))
    await user.click(within(await dialog()).getByRole('button', { name: 'Sí, quitar' }))

    expect(total()).toBe('Total de la venta₡4.500')
    expect(screen.queryByRole('button', { name: /^Quitar/ })).toBeNull()
    expect(document.activeElement).toBe(button('Agregar otro cartón'))
  })

  it('stops at 20 lines', async () => {
    // A sale that already has 20, rather than 20 typed in one by one.
    const lines = Array.from({ length: 20 }, () => ({ cartonType: 'A', quantity: 1, unitPrice: 1000, lineTotal: 1000 }))
    handlers['GET /api/sales/7'] = () => json({ ...CASH_SALE, id: '7', total: 20000, items: lines })
    const { user } = openApp('/ventas/7/editar')

    await user.click(await screen.findByRole('button', { name: 'Agregar otro cartón' }))

    expect(screen.getByText('Una venta no puede tener más de 20 líneas.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Tipo de cartón/ })).toHaveLength(20)
  })

  it('what the API refuses shows on the right line', async () => {
    handlers['POST /api/sales'] = () =>
      json({ errors: { 'items[1].unitPrice': ['El precio no puede ser mayor que ₡1.000.000.'] } }, 400)
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await user.click(button('Agregar otro cartón'))
    await fillLine(user, 'Cartón de 30 huevos', '1', '4500', 2)
    await choose(user, paidWith(), 'Al contado')

    await user.click(save())

    const error = await screen.findByText('El precio no puede ser mayor que ₡1.000.000.')
    expect(field('Precio por cartón, línea 2').getAttribute('aria-describedby')).toContain(error.id)
  })
})

describe('sale form: last prices', () => {
  beforeEach(() => {
    handlers['GET /api/sales/last-prices'] = () => json({ A: 2000, B: 4500 })
  })

  it('choosing a carton fills in its last price, on every line', async () => {
    const { user } = openApp('/ventas/nueva')
    await waitFor(() => expect(callsTo('GET', '/api/sales/last-prices')).toHaveLength(1))

    await choose(user, typeOf(), 'Cartón de 30 huevos')
    expect(field('Precio por cartón').value).toBe('4.500')

    await user.click(button('Agregar otro cartón'))
    await choose(user, typeOf(2), 'Cartón de 15 huevos')
    expect(field('Precio por cartón, línea 2').value).toBe('2.000')
    expect(total()).toBe('Total de la venta₡6.500')
  })

  it('editing keeps the price the sale has, not the last one', async () => {
    openApp('/ventas/5/editar')

    await screen.findByText('Editar venta')
    expect(field('Precio por cartón, línea 1').value).toBe('1.000')
  })
})

describe('sale form: paid with a fiado', () => {
  it('shows what is left, and the message says paid and still owed', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user, 'Cartón de 15 huevos', '5', '1000')
    await choose(user, paidWith(), 'Fiado')
    await user.click(await screen.findByRole('button', { name: /^María Rodríguez/ }))

    await user.type(field('¿Pagó algo ahora? (opcional)'), '2000')
    expect(screen.getByText('Queda debiendo').parentElement!.textContent).toBe('Queda debiendo₡3.000')

    await user.click(save())

    expect((await dialog()).textContent).toContain('Pagó ₡2.000 y queda debiendo ₡3.000 de esta venta.')
    expect(posted()[0].paidNow).toBe(2000)
  })

  it('more than the total is refused without sending', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Fiado')
    await user.click(await screen.findByRole('button', { name: /^María Rodríguez/ }))
    await user.type(field('¿Pagó algo ahora? (opcional)'), '5000')

    await user.click(save())

    expect(screen.getByText('No puede ser mayor que el total de la venta (₡3.000).')).toBeTruthy()
    expect(posted()).toEqual([])
  })

  it('all of it is a cash sale, and one press makes it one, keeping who bought', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Fiado')
    await user.click(await screen.findByRole('button', { name: /^María Rodríguez/ }))
    await user.type(field('¿Pagó algo ahora? (opcional)'), '3000')

    await user.click(save())
    expect(screen.getByRole('alert', { name: '' }).textContent).toContain('Si pagó todo, es una venta al contado.')
    await user.click(button('Cambiar a Al contado'))

    expect(paidWith().textContent).toBe('Al contado')
    expect(chosen()).toBe('Elegido: María Rodríguez')
    expect(document.activeElement).toBe(save())
  })
})

describe('sale form: editing', () => {
  it('loads the sale with every line editable, its payment and who', async () => {
    openApp('/ventas/6/editar')

    await screen.findByText('Editar venta')
    expect(typeOf(1).textContent).toBe('Cartón de 15 huevos')
    expect(typeOf(2).textContent).toBe('Cartón de 30 huevos')
    expect(paidWith().textContent).toBe('Fiado')
    expect(chosen()).toBe('Elegido: María Rodríguez')
    expect(field('¿Pagó algo ahora? (opcional)').value).toBe('1.000')
  })

  it('a cash sale with nobody named opens on Cliente sin nombre', async () => {
    openApp('/ventas/5/editar')

    await screen.findByText('Editar venta')
    expect(chosen()).toBe('Elegido: Cliente sin nombre')
  })

  it('saves over the same sale', async () => {
    const { user } = openApp(`/ventas/5/editar?fecha=${OLD_DAY}`)
    await screen.findByText('Editar venta')

    await user.click(save())

    await dialog()
    expect(callsTo('PUT', '/api/sales/5')[0].body).toMatchObject({ date: OLD_DAY, isCredit: false, customerId: null })
  })

  it('deleting asks first, saying what happens to the abono and the balance, then goes back', async () => {
    const { router, user } = openApp(`/ventas/6/editar?fecha=${OLD_DAY}&pestana=fiado`)
    await screen.findByText('Editar venta')

    await user.click(button('Borrar venta'))
    const question = await dialog()
    await waitFor(() =>
      expect(question.textContent).toContain(
        '¿Borrar la venta fiada de ₡5.000 a María Rodríguez? También se borra el abono de ₡1.000 que dio al hacerla. ' +
          'Su saldo bajará de ₡8.000 a ₡4.000.',
      ),
    )
    await user.click(within(question).getByRole('button', { name: 'Sí, borrar' }))

    expect((await dialog()).textContent).toContain('Venta borrada.')
    expect(addressOf(router)).toBe(`/ventas?fecha=${OLD_DAY}&pestana=fiado`)
  })

  it('a fiado of a deleted customer is shown, but can no longer change', async () => {
    handlers['GET /api/sales/6'] = () => json({ ...CREDIT_SALE, customer: { ...MARIA_REF, isDeleted: true } })
    openApp('/ventas/6/editar')

    expect(await screen.findByText(/un cliente que se borró, así que ya no se puede cambiar/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Guardar venta' })).toBeNull()
  })

  it('a sale that no longer exists: says so and goes back to Ventas', async () => {
    handlers['GET /api/sales/5'] = () => new Response('', { status: 404 })
    const { router } = openApp(`/ventas/5/editar?fecha=${OLD_DAY}`)

    expect((await dialog()).textContent).toContain('Esta venta ya no existe.')
    expect(addressOf(router)).toBe(`/ventas?fecha=${OLD_DAY}`)
  })
})

describe('sale form: leaving', () => {
  it('an untouched form leaves without asking, by Cancelar or ✕', async () => {
    const { router, user } = openApp(`/ventas/nueva?fecha=${OLD_DAY}`)

    await user.click(button('Cerrar'))

    expect(addressOf(router)).toBe(`/ventas?fecha=${OLD_DAY}`)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it.each(['Cancelar', 'Cerrar', 'Clientes'])('%s asks first when something was filled in', async (exit) => {
    const { router, user } = openApp('/ventas/nueva')
    await fillLine(user)

    await user.click(button(exit))

    const warning = await dialog()
    expect(warning.textContent).toContain('¿Salir sin guardar?')
    expect(router.state.location.pathname).toBe('/ventas/nueva')

    await user.click(within(warning).getByRole('button', { name: 'Sí, salir' }))
    expect(router.state.location.pathname).not.toBe('/ventas/nueva')
  })

  it('tells the window when there are changes, and saving clears it', async () => {
    const postMessage = vi.fn()
    window.chrome = { webview: { postMessage } }
    const { user } = openApp('/ventas/nueva')
    expect(postMessage).not.toHaveBeenCalled()

    await fillLine(user)
    expect(postMessage).toHaveBeenLastCalledWith('unsaved-changes')

    await choose(user, paidWith(), 'Al contado')
    await user.click(save())

    await dialog()
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith('no-unsaved-changes'))
  })

  it('a double click on Guardar venta saves once', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Al contado')

    await user.dblClick(save())

    await dialog()
    expect(posted()).toHaveLength(1)
  })

  it('when saving fails, says so without details and keeps what was typed', async () => {
    handlers['POST /api/sales'] = () => new Response('', { status: 500 })
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Al contado')

    await user.click(save())

    expect((await dialog()).textContent).toContain('No se pudo guardar la venta. Intente de nuevo.')
    expect(field('Cantidad').value).toBe('3')
  })

  it('an emptied date is asked for, and nothing is sent', async () => {
    const { user } = openApp('/ventas/nueva')
    await fillLine(user)
    await choose(user, paidWith(), 'Al contado')

    fireEvent.change(field('Fecha'), { target: { value: '' } })
    await user.click(save())

    expect(screen.getByText('Escoja la fecha de la venta.')).toBeTruthy()
    expect(document.activeElement).toBe(field('Fecha'))
    expect(posted()).toEqual([])
  })
})
