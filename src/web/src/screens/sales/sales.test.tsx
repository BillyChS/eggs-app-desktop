import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateLong, todayLocal, yesterdayLocal } from '../../lib/dates'
import { routes } from '../../routes'

const TODAY = todayLocal()
const YESTERDAY = yesterdayLocal()
const OLD_DAY = '2026-01-05'

const line = (cartonType: 'A' | 'B', quantity: number, unitPrice: number) => ({
  cartonType,
  quantity,
  unitPrice,
  lineTotal: quantity * unitPrice,
})

const CASH = { isCredit: false, customer: null }
const MIXED = { id: '1', date: OLD_DAY, total: 5000, ...CASH, items: [line('A', 3, 1000), line('B', 1, 2000)] }
const SINGLE = { id: '2', date: OLD_DAY, total: 4000, ...CASH, items: [line('B', 2, 2000)] }

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
const dialog = () => screen.findByRole('alertdialog')
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label)
const quantity = () => field('Cantidad')
const price = () => field('Precio por cartón')
const carton15 = () => button('Cartón de 15 huevos')
const carton30 = () => button('Cartón de 30 huevos')
const save = () => button('Guardar venta')
const cash = () => button('Al contado')
const add = () => button('Agregar otro cartón')
const saleTotal = () => screen.getByText('Total de la venta').parentElement!.textContent
const subtotalShown = () => screen.getByText('Subtotal').parentElement!.textContent
const posted = () => callsTo('POST', '/api/sales')
const doneLines = () =>
  within(screen.getByRole('list', { name: 'Cartones de esta venta' }))
    .getAllByRole('listitem')
    .map((row) => row.firstChild!.textContent)

type User = ReturnType<typeof userEvent.setup>

/** Saves as a cash sale, which a new sale must be told it is. */
async function saveCash(user: User) {
  await user.click(cash())
  await user.click(save())
}

async function fillLine(user: User, carton: HTMLElement, howMany: string, howMuch: string) {
  await user.click(carton)
  await user.clear(quantity())
  await user.type(quantity(), howMany)
  await user.clear(price())
  await user.type(price(), howMuch)
}

beforeEach(() => {
  calls.length = 0
  handlers = {
    'GET /api/health': () => json({ status: 'ok', time: '2026-11-04T10:00:00' }),
    'GET /api/sales': () => json({ sales: [], cashTotal: 0, creditTotal: 0 }),
    'GET /api/payments': () => json({ payments: [], total: 0 }),
    'GET /api/sales/last-prices': () => json({}),
    'GET /api/sales/1': () => json(MIXED),
    'GET /api/sales/2': () => json(SINGLE),
    'POST /api/sales': ({ body }) => {
      const { date, items } = body as { date: string; items: { quantity: number; unitPrice: number }[] }
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      return json({ id: '9', date, total, ...CASH, items }, 201)
    },
    'PUT /api/sales/1': () => json(MIXED),
    'PUT /api/sales/2': () => json(SINGLE),
    'DELETE /api/sales/1': () => new Response(null, { status: 204 }),
  }
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  delete window.chrome
})

describe('sales list', () => {
  it('opens on today and asks for that one day', async () => {
    open('/ventas')

    await screen.findByText('Todavía no hay ventas hoy.')

    const query = callsTo('GET', '/api/sales')[0].url.searchParams
    expect(query.get('from')).toBe(TODAY)
    expect(query.get('to')).toBe(TODAY)
    expect(screen.getByText(formatDateLong(TODAY)!)).toBeTruthy()
    expect(field('Fecha').value).toBe(TODAY)
    expect(button('Hoy').getAttribute('aria-pressed')).toBe('true')
  })

  it('shows one row per sale with its summary and total, and the total of the day', async () => {
    handlers['GET /api/sales'] = () => json({ sales: [MIXED, SINGLE], cashTotal: 9000, creditTotal: 0 })

    open(`/ventas?fecha=${OLD_DAY}`)

    const rows = await screen.findAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['3 de 15 · 1 de 30₡5.000', '2 de 30₡4.000'])
    expect(screen.getByText('Entró').parentElement!.textContent).toBe('Entró₡9.000')
  })

  it('a summary adds up the same type bought at different prices', async () => {
    const sale = { ...MIXED, items: [line('A', 2, 1000), line('B', 1, 2000), line('A', 1, 900)] }
    handlers['GET /api/sales'] = () => json({ sales: [sale], cashTotal: 4900, creditTotal: 0 })

    open(`/ventas?fecha=${OLD_DAY}`)

    expect(await screen.findByText('3 de 15 · 1 de 30')).toBeTruthy()
  })

  it('a day other than today has its own empty message', async () => {
    open(`/ventas?fecha=${OLD_DAY}`)

    expect(await screen.findByText('No hay ventas este día.')).toBeTruthy()
    expect(screen.getByText(formatDateLong(OLD_DAY)!)).toBeTruthy()
  })

  it.each(['no-es-fecha', '2026-02-30', '2999-01-01', '0026-01-01'])('an address with %s opens on today', async (day) => {
    open(`/ventas?fecha=${day}`)

    await screen.findByText('Todavía no hay ventas hoy.')
    expect(callsTo('GET', '/api/sales')[0].url.searchParams.get('from')).toBe(TODAY)
  })

  it('Ayer shows yesterday, keeps it in the address, and Hoy comes back', async () => {
    const { router, user } = open('/ventas')
    await screen.findByText('Todavía no hay ventas hoy.')

    await user.click(button('Ayer'))

    expect(await screen.findByText('No hay ventas este día.')).toBeTruthy()
    expect(address(router)).toBe(`/ventas?fecha=${YESTERDAY}`)
    expect(callsTo('GET', '/api/sales').at(-1)!.url.searchParams.get('from')).toBe(YESTERDAY)

    await user.click(button('Hoy'))

    expect(await screen.findByText('Todavía no hay ventas hoy.')).toBeTruthy()
  })

  it('picking a date in the field shows that day', async () => {
    const { router } = open('/ventas')
    await screen.findByText('Todavía no hay ventas hoy.')

    fireEvent.change(field('Fecha'), { target: { value: OLD_DAY } })

    await screen.findByText('No hay ventas este día.')
    expect(address(router)).toBe(`/ventas?fecha=${OLD_DAY}`)
  })

  it.each(['', '0002-11-04', '2999-01-01'])(
    'while the field holds "%s" the list stays on its day, and leaving the field restores it',
    async (value) => {
      const { router } = open(`/ventas?fecha=${OLD_DAY}`)
      await screen.findByText('No hay ventas este día.')
      const requests = callsTo('GET', '/api/sales').length

      fireEvent.change(field('Fecha'), { target: { value } })

      expect(field('Fecha').value).toBe(value)
      expect(screen.getByText(formatDateLong(OLD_DAY)!)).toBeTruthy()
      expect(address(router)).toBe(`/ventas?fecha=${OLD_DAY}`)
      expect(callsTo('GET', '/api/sales').length).toBe(requests)

      fireEvent.blur(field('Fecha'))

      expect(field('Fecha').value).toBe(OLD_DAY)
    },
  )

  it('an old day answer that arrives late does not replace the newer one', async () => {
    let answerOld = (_response: Response) => {}
    handlers['GET /api/sales'] = ({ url }) => {
      if (url.searchParams.get('from') === OLD_DAY) {
        return new Promise((resolve) => {
          answerOld = resolve
        })
      }
      return json({ sales: [], cashTotal: 0, creditTotal: 0 })
    }

    const { user } = open(`/ventas?fecha=${OLD_DAY}`)
    await user.click(button('Hoy'))
    await screen.findByText('Todavía no hay ventas hoy.')

    answerOld(json({ sales: [MIXED], cashTotal: 5000, creditTotal: 0 }))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screen.queryByText('₡5.000')).toBeNull()
    expect(screen.getByText('Todavía no hay ventas hoy.')).toBeTruthy()
  })

  it('never shows the total of another day while the new one loads', async () => {
    handlers['GET /api/sales'] = ({ url }) =>
      url.searchParams.get('from') === OLD_DAY
        ? json({ sales: [MIXED], cashTotal: 5000, creditTotal: 0 })
        : new Promise(() => {})

    const { user } = open(`/ventas?fecha=${OLD_DAY}`)
    await screen.findByText('Entró')

    await user.click(button('Hoy'))

    expect(screen.queryByText('Entró hoy')).toBeNull()
    expect(screen.queryByText('Entró')).toBeNull()
    expect(screen.getByText('Cargando…')).toBeTruthy()
  })

  it('Nueva venta starts on the day being looked at', async () => {
    const { router, user } = open(`/ventas?fecha=${YESTERDAY}`)
    await screen.findByText('No hay ventas este día.')

    await user.click(button('Nueva venta'))

    expect(address(router)).toBe(`/ventas/nueva?fecha=${YESTERDAY}`)
    expect(field('Fecha').value).toBe(YESTERDAY)
    expect(button('Ayer').getAttribute('aria-pressed')).toBe('true')
  })

  it('a row opens that sale, and Volver returns to its day', async () => {
    handlers['GET /api/sales'] = () => json({ sales: [SINGLE], cashTotal: 4000, creditTotal: 0 })

    const { router, user } = open(`/ventas?fecha=${OLD_DAY}`)
    await user.click(await screen.findByRole('button', { name: /2 de 30/ }))

    expect(router.state.location.pathname).toBe('/ventas/2/editar')
    await screen.findByLabelText('Cantidad')

    await user.click(button('Volver'))
    expect(address(router)).toBe(`/ventas?fecha=${OLD_DAY}`)
  })

  it('when the list can not load, says so and can try again', async () => {
    handlers['GET /api/sales'] = () => json({}, 500)

    const { user } = open('/ventas')

    expect((await screen.findByRole('alert')).textContent).toBe('No se pudieron cargar las ventas.')

    handlers['GET /api/sales'] = () => json({ sales: [], cashTotal: 0, creditTotal: 0 })
    await user.click(button('Intentar de nuevo'))

    expect(await screen.findByText('Todavía no hay ventas hoy.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('sale form: one line', () => {
  it('starts with no carton chosen, a quantity of 1, no price, and focus on the first carton', () => {
    open('/ventas/nueva')

    expect(carton15().getAttribute('aria-pressed')).toBe('false')
    expect(carton30().getAttribute('aria-pressed')).toBe('false')
    expect(quantity().value).toBe('1')
    expect(price().value).toBe('')
    expect(field('Fecha').value).toBe(TODAY)
    expect(saleTotal()).toBe('Total de la venta₡0')
    expect(document.activeElement).toBe(carton15())
  })

  it('choosing a carton marks it and moves on to the quantity, selected to be typed over', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(carton30())

    expect(carton30().getAttribute('aria-pressed')).toBe('true')
    expect(carton15().getAttribute('aria-pressed')).toBe('false')
    expect(document.activeElement).toBe(quantity())

    await user.keyboard('3')

    expect(quantity().value).toBe('3')
  })

  it('clicking the quantity also selects it, so typing does not make 13', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(quantity())
    await user.keyboard('3')

    expect(quantity().value).toBe('3')
  })

  it('clicking the quantity after choosing a carton keeps it selected, though it already had focus', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(carton15())
    expect(document.activeElement).toBe(quantity())

    await user.click(quantity())
    await user.keyboard('4')

    expect(quantity().value).toBe('4')
  })

  it('a second click places the caret, to change a single digit', async () => {
    const { user } = open('/ventas/nueva')
    await user.click(price())
    await user.keyboard('1000')
    await user.tab()

    await user.click(price())
    expect(price().selectionStart).toBe(0)
    expect(price().selectionEnd).toBe(5)

    await user.click(price())
    expect(price().selectionStart).toBe(price().selectionEnd)
  })

  it('shows the subtotal and total while typing', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '3', '1000')

    expect(subtotalShown()).toBe('Subtotal₡3.000')
    expect(saleTotal()).toBe('Total de la venta₡3.000')

    await user.clear(quantity())
    await user.type(quantity(), '2')

    expect(saleTotal()).toBe('Total de la venta₡2.000')
  })

  it('a blank form shows what is missing, on the first thing missing, and sends nothing', async () => {
    const { user } = open('/ventas/nueva')

    await saveCash(user)

    expect(screen.getByText('Escoja el tipo de cartón.')).toBeTruthy()
    expect(screen.getByText('Escriba el precio por cartón.')).toBeTruthy()
    expect(document.activeElement).toBe(carton15())
    expect(posted()).toEqual([])
  })

  it('an error goes away once that field changes', async () => {
    const { user } = open('/ventas/nueva')
    await saveCash(user)

    await user.click(carton15())
    expect(screen.queryByText('Escoja el tipo de cartón.')).toBeNull()

    await user.type(price(), '1')
    expect(screen.queryByText('Escriba el precio por cartón.')).toBeNull()
  })

  it.each([
    ['2,5', 'Escriba un número entero, sin comas ni puntos.'],
    ['1.000', 'Escriba un número entero, sin comas ni puntos.'],
    ['abc', 'Escriba un número entero, sin comas ni puntos.'],
    ['0', 'Escriba la cantidad de cartones.'],
    ['10001', 'La cantidad no puede ser mayor que 10.000.'],
  ])('a quantity of %s is refused and not sent', async (howMany, message) => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), howMany, '1000')
    await saveCash(user)

    expect(screen.getByText(message)).toBeTruthy()
    expect(document.activeElement).toBe(quantity())
    expect(posted()).toEqual([])
  })

  it('an empty quantity is refused', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(carton15())
    await user.clear(quantity())
    await user.type(price(), '1000')
    await saveCash(user)

    expect(screen.getByText('Escriba la cantidad de cartones.')).toBeTruthy()
    expect(posted()).toEqual([])
  })

  it('a price over the limit is refused', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '1', '1000001')
    await saveCash(user)

    expect(screen.getByText('El precio no puede ser mayor que ₡1.000.000.')).toBeTruthy()
    expect(document.activeElement).toBe(price())
    expect(posted()).toEqual([])
  })
})

describe('sale form: saving', () => {
  it('sends the line, confirms with total and date, and shows the list of that day', async () => {
    const { router, user } = open(`/ventas/nueva?fecha=${OLD_DAY}`)

    await fillLine(user, carton15(), '3', '1000')
    await saveCash(user)

    const success = await dialog()
    expect(success.textContent).toContain(`Venta guardada: ₡3.000, ${formatDateLong(OLD_DAY)}.`)
    expect(posted()[0].body).toEqual({
      date: OLD_DAY,
      items: [{ cartonType: 'A', quantity: 3, unitPrice: 1000 }],
      isCredit: false,
      customerId: null,
      paidNow: 0,
    })
    expect(address(router)).toBe(`/ventas?fecha=${OLD_DAY}`)
  })

  it('a sale moved to another day opens the list on that day', async () => {
    const { router, user } = open('/ventas/nueva')

    await fillLine(user, carton30(), '1', '2000')
    await user.click(button('Ayer'))
    await saveCash(user)

    await dialog()
    expect((posted()[0].body as { date: string }).date).toBe(YESTERDAY)
    expect(address(router)).toBe(`/ventas?fecha=${YESTERDAY}`)
  })

  it('an emptied date is asked for, and nothing is sent', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton30(), '1', '2000')
    fireEvent.change(field('Fecha'), { target: { value: '' } })
    await saveCash(user)

    expect(screen.getByText('Escoja la fecha de la venta.')).toBeTruthy()
    expect(document.activeElement).toBe(field('Fecha'))
    expect(posted()).toEqual([])
  })

  it('a double click saves once', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton30(), '1', '2000')
    await user.click(cash())
    await user.dblClick(save())

    await dialog()
    expect(posted().length).toBe(1)
  })

  it('what the API refuses shows on the right line, and the form stays', async () => {
    handlers['POST /api/sales'] = () =>
      json(
        {
          errors: {
            date: ['La fecha no puede ser futura.'],
            'items[0].unitPrice': ['Primera línea rechazada.'],
            'items[1].quantity': ['Segunda línea rechazada.'],
          },
        },
        400,
      )

    const { router, user } = open('/ventas/nueva')
    await fillLine(user, carton15(), '1', '1000')
    await user.click(add())
    await fillLine(user, carton30(), '1', '2000')
    await saveCash(user)

    await screen.findByText('La fecha no puede ser futura.')
    const firstLine = screen.getByRole('list', { name: 'Cartones de esta venta' })
    expect(within(firstLine).getByText('Primera línea rechazada.')).toBeTruthy()
    expect(within(firstLine).queryByText('Segunda línea rechazada.')).toBeNull()
    expect(quantity().getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field('Fecha'))
    expect(router.state.location.pathname).toBe('/ventas/nueva')
  })

  it('when saving fails, says so without details and keeps what was typed', async () => {
    handlers['POST /api/sales'] = () => Promise.reject(new TypeError('Failed to fetch'))

    const { router, user } = open('/ventas/nueva')
    await fillLine(user, carton15(), '3', '1000')
    await saveCash(user)

    const error = await dialog()
    expect(error.textContent).toContain('No se pudo guardar la venta.')
    expect(error.textContent).not.toMatch(/fetch|HTTP/)
    expect(router.state.location.pathname).toBe('/ventas/nueva')
    expect(price().value).toBe('1.000')
  })
})

describe('sale form: several lines', () => {
  it('keeps the first line as a summary and opens a blank one, with the total of both', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '3', '1000')
    await user.click(add())

    expect(doneLines()).toEqual(['3 de 15 huevos × ₡1.000 = ₡3.000'])
    expect(carton15().getAttribute('aria-pressed')).toBe('false')
    expect(carton30().getAttribute('aria-pressed')).toBe('false')
    expect(quantity().value).toBe('1')
    expect(price().value).toBe('')
    expect(document.activeElement).toBe(carton15())
    expect(saleTotal()).toBe('Total de la venta₡3.000')

    await fillLine(user, carton30(), '1', '2000')

    expect(subtotalShown()).toBe('Subtotal₡2.000')
    expect(saleTotal()).toBe('Total de la venta₡5.000')
  })

  it('an incomplete line is not added: it shows why and stays open', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(carton15())
    await user.click(add())

    expect(screen.getByText('Escriba el precio por cartón.')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Cartones de esta venta' })).toBeNull()
    expect(carton15().getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(price())
  })

  it('sends every line in order, including the same type at a different price', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '2', '1000')
    await user.click(add())
    await fillLine(user, carton30(), '1', '2000')
    await user.click(add())
    await fillLine(user, carton15(), '1', '900')
    await saveCash(user)

    expect((await dialog()).textContent).toContain('₡4.900')
    expect((posted()[0].body as { items: unknown[] }).items).toEqual([
      { cartonType: 'A', quantity: 2, unitPrice: 1000 },
      { cartonType: 'B', quantity: 1, unitPrice: 2000 },
      { cartonType: 'A', quantity: 1, unitPrice: 900 },
    ])
  })

  it('an untouched open line is left out of the sale', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '3', '1000')
    await user.click(add())
    await saveCash(user)

    await dialog()
    expect((posted()[0].body as { items: unknown[] }).items.length).toBe(1)
  })

  it.each([
    ['a carton', (user: User) => user.click(carton30()), 'Escriba el precio por cartón.'],
    ['a quantity', (user: User) => user.type(quantity(), '5'), 'Escoja el tipo de cartón.'],
    ['a price', (user: User) => user.type(price(), '500'), 'Escoja el tipo de cartón.'],
  ])('an open line with only %s stops the save instead of being dropped', async (_what, touch, message) => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '3', '1000')
    await user.click(add())
    await touch(user)
    await saveCash(user)

    expect(screen.getByText(message)).toBeTruthy()
    expect(posted()).toEqual([])
  })

  it('the open line can be dropped, and a new one opened again', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '3', '1000')
    await user.click(add())
    await fillLine(user, carton30(), '1', '2000')
    await user.click(button('Quitar'))

    expect(screen.queryByLabelText('Cantidad')).toBeNull()
    expect(saleTotal()).toBe('Total de la venta₡3.000')
    expect(document.activeElement).toBe(add())

    await user.click(add())
    expect(quantity().value).toBe('1')
    expect(document.activeElement).toBe(carton15())
  })

  it('the only line has no Quitar', () => {
    open('/ventas/nueva')

    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull()
  })

  async function twoLines() {
    const opened = open('/ventas/nueva')
    await fillLine(opened.user, carton15(), '3', '1000')
    await opened.user.click(add())
    return opened
  }

  it('removing a finished line asks first, naming it; No keeps it', async () => {
    const { user } = await twoLines()

    await user.click(button(/^Quitar 3 de 15/))

    const confirm = await dialog()
    expect(confirm.textContent).toContain('¿Quitar 3 de 15 huevos × ₡1.000 = ₡3.000?')

    await user.click(within(confirm).getByRole('button', { name: 'No, cancelar' }))

    expect(doneLines().length).toBe(1)
  })

  it('removing a finished line takes it out of the total', async () => {
    const { user } = await twoLines()
    await fillLine(user, carton30(), '1', '2000')

    await user.click(button(/^Quitar 3 de 15/))
    await user.click(within(await dialog()).getByRole('button', { name: 'Sí, quitar' }))

    expect(screen.queryByRole('list', { name: 'Cartones de esta venta' })).toBeNull()
    expect(saleTotal()).toBe('Total de la venta₡2.000')
  })

  it('removing the last line that is left opens a blank one', async () => {
    const { user } = await twoLines()
    await user.click(button('Quitar'))

    await user.click(button(/^Quitar 3 de 15/))
    await user.click(within(await dialog()).getByRole('button', { name: 'Sí, quitar' }))

    expect(quantity().value).toBe('1')
    expect(document.activeElement).toBe(carton15())
    expect(saleTotal()).toBe('Total de la venta₡0')
  })

  it('stops at 20 lines', async () => {
    const { user } = open('/ventas/nueva')

    for (let index = 0; index < 19; index++) {
      await fillLine(user, carton15(), '1', '100')
      await user.click(add())
    }

    await fillLine(user, carton15(), '1', '100')
    await user.click(add())

    expect(screen.getByText('Una venta no puede tener más de 20 líneas.')).toBeTruthy()
    expect(doneLines().length).toBe(19)

    await saveCash(user)
    await dialog()
    expect((posted()[0].body as { items: unknown[] }).items.length).toBe(20)
  }, 30_000)
})

describe('sale form: last prices', () => {
  beforeEach(() => {
    handlers['GET /api/sales/last-prices'] = () => json({ A: 1000 })
  })

  it('choosing a carton fills in its last price, and that counts in the total', async () => {
    const { user } = open('/ventas/nueva')
    await waitFor(() => expect(callsTo('GET', '/api/sales/last-prices').length).toBe(1))

    await user.click(carton15())

    await waitFor(() => expect(price().value).toBe('1.000'))
    expect(saleTotal()).toBe('Total de la venta₡1.000')
  })

  it('stays blank before a carton is chosen, and for a carton never sold', async () => {
    const { user } = open('/ventas/nueva')
    await waitFor(() => expect(callsTo('GET', '/api/sales/last-prices').length).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(price().value).toBe('')

    await user.click(carton30())

    expect(price().value).toBe('')
  })

  it('switching cartons switches a price that was not typed', async () => {
    handlers['GET /api/sales/last-prices'] = () => json({ A: 1000, B: 2000 })
    const { user } = open('/ventas/nueva')

    await user.click(carton15())
    await waitFor(() => expect(price().value).toBe('1.000'))

    await user.click(carton30())
    expect(price().value).toBe('2.000')
  })

  it('switching cartons to one never sold empties a price that was not typed', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(carton15())
    await waitFor(() => expect(price().value).toBe('1.000'))

    await user.click(carton30())
    expect(price().value).toBe('')
  })

  it('a typed price is kept when switching cartons', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(carton30())
    await user.type(price(), '1500')
    await user.click(carton15())

    expect(price().value).toBe('1.500')
  })

  it('the filled-in price can be typed over, and is what gets sent', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(carton15())
    await waitFor(() => expect(price().value).toBe('1.000'))
    await user.click(price())
    await user.keyboard('1200')

    expect(price().value).toBe('1.200')

    await saveCash(user)
    await dialog()
    expect((posted()[0].body as { items: { unitPrice: number }[] }).items[0].unitPrice).toBe(1200)
  })

  it('the filled-in price can be saved as it is', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(carton15())
    await waitFor(() => expect(price().value).toBe('1.000'))
    await saveCash(user)

    await dialog()
    expect((posted()[0].body as { items: { unitPrice: number }[] }).items[0].unitPrice).toBe(1000)
  })

  it('prices that arrive after the carton was chosen still fill in', async () => {
    let answer = (_response: Response) => {}
    handlers['GET /api/sales/last-prices'] = () =>
      new Promise((resolve) => {
        answer = resolve
      })

    const { user } = open('/ventas/nueva')
    await user.click(carton15())
    expect(price().value).toBe('')

    answer(json({ A: 1000 }))

    await waitFor(() => expect(price().value).toBe('1.000'))
  })

  it('a new line starts from the last price too, not from the line before it', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '1', '900')
    await user.click(add())
    await user.click(carton15())

    expect(price().value).toBe('1.000')
  })

  it('without prices the form still works, with the field blank', async () => {
    handlers['GET /api/sales/last-prices'] = () => json({}, 500)
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '1', '900')
    await saveCash(user)

    await dialog()
    expect(screen.queryByText(/No se pudo/)).toBeNull()
    expect(posted().length).toBe(1)
  })

  it('editing keeps the price the sale has, not the last one', async () => {
    handlers['GET /api/sales/last-prices'] = () => json({ B: 9999 })

    open('/ventas/2/editar')

    await screen.findByLabelText('Cantidad')
    await waitFor(() => expect(callsTo('GET', '/api/sales/last-prices').length).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(price().value).toBe('2.000')
  })
})

describe('sale form: Enter', () => {
  it('goes type → quantity → price → Al contado → Guardar venta, saving only on the button itself', async () => {
    const { user } = open('/ventas/nueva')
    expect(document.activeElement).toBe(carton15())

    await user.keyboard('{Enter}')
    expect(carton15().getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(quantity())
    await user.keyboard('3')

    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(price())
    await user.keyboard('1000')

    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(cash())
    expect(cash().getAttribute('aria-pressed')).toBe('false')

    await user.keyboard('{Enter}')
    expect(cash().getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(save())
    expect(posted()).toEqual([])
    expect(screen.queryByRole('alertdialog')).toBeNull()

    await user.keyboard('{Enter}')
    expect((await dialog()).textContent).toContain('Venta guardada: ₡3.000')
    expect(posted().length).toBe(1)
  })

  it('never saves from the fields, even with a complete line', async () => {
    const { user } = open('/ventas/nueva')

    await fillLine(user, carton15(), '3', '1000')

    await user.click(quantity())
    await user.keyboard('{Enter}')
    expect(posted()).toEqual([])

    await user.keyboard('{Enter}')
    expect(posted()).toEqual([])
    expect(document.activeElement).toBe(cash())
  })

  it('once the payment is chosen, the price moves straight to Guardar venta', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user, carton15(), '3', '1000')
    await user.click(cash())

    await user.click(price())
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(save())
    expect(posted()).toEqual([])
  })

  it('moves on from an empty field too, without showing errors yet', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(price())
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(cash())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('in the date field it moves to the carton, and does not save', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user, carton15(), '3', '1000')

    field('Fecha').focus()
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(carton15())
    expect(posted()).toEqual([])
  })

  it('in the date field with no open line it moves on to the payment', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user, carton15(), '3', '1000')
    await user.click(add())
    await user.click(button('Quitar'))

    field('Fecha').focus()
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(cash())
  })

  it('holding Enter down does not run through the fields', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(quantity())
    fireEvent.keyDown(quantity(), { key: 'Enter', repeat: true })

    expect(document.activeElement).toBe(quantity())
  })

  it('held down on Guardar venta it is cancelled before it can press the button', () => {
    open('/ventas/nueva')

    // false: something called preventDefault, which is what stops the browser pressing the button.
    expect(fireEvent.keyDown(save(), { key: 'Enter', repeat: true })).toBe(false)
    expect(fireEvent.keyDown(save(), { key: 'Enter' })).toBe(true)
  })

  it('Enter on Agregar otro cartón adds the line', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user, carton15(), '3', '1000')

    add().focus()
    await user.keyboard('{Enter}')

    expect(doneLines()).toEqual(['3 de 15 huevos × ₡1.000 = ₡3.000'])
    expect(posted()).toEqual([])
  })
})

describe('sale form: editing', () => {
  it('loads the sale: the last line open, the others as summaries', async () => {
    open('/ventas/1/editar')

    await screen.findByLabelText('Cantidad')

    expect(doneLines()).toEqual(['3 de 15 huevos × ₡1.000 = ₡3.000'])
    expect(carton30().getAttribute('aria-pressed')).toBe('true')
    expect(quantity().value).toBe('1')
    expect(price().value).toBe('2.000')
    expect(field('Fecha').value).toBe(OLD_DAY)
    expect(saleTotal()).toBe('Total de la venta₡5.000')
    expect(document.activeElement).not.toBe(carton15())
  })

  it('saves over the same sale, with every line', async () => {
    const { router, user } = open('/ventas/1/editar')
    await screen.findByLabelText('Cantidad')

    await user.clear(price())
    await user.type(price(), '2500')
    await saveCash(user)

    await dialog()
    expect(callsTo('PUT', '/api/sales/1')[0].body).toEqual({
      date: OLD_DAY,
      items: [
        { cartonType: 'A', quantity: 3, unitPrice: 1000 },
        { cartonType: 'B', quantity: 1, unitPrice: 2500 },
      ],
      isCredit: false,
      customerId: null,
      paidNow: 0,
    })
    expect(posted()).toEqual([])
    expect(address(router)).toBe(`/ventas?fecha=${OLD_DAY}`)
  })

  it('a sale that no longer exists: says so and goes back to the list', async () => {
    handlers['GET /api/sales/1'] = () => new Response(null, { status: 404 })

    const { router } = open(`/ventas/1/editar?fecha=${OLD_DAY}`)

    expect((await dialog()).textContent).toContain('Esta venta ya no existe.')
    await waitFor(() => expect(address(router)).toBe(`/ventas?fecha=${OLD_DAY}`))
  })

  it('a sale deleted while it was open: says so when saving', async () => {
    handlers['PUT /api/sales/1'] = () => new Response(null, { status: 404 })

    const { router, user } = open('/ventas/1/editar')
    await screen.findByLabelText('Cantidad')
    await saveCash(user)

    expect((await dialog()).textContent).toContain('Esta venta ya no existe.')
    await waitFor(() => expect(router.state.location.pathname).toBe('/ventas'))
  })

  it('when a sale can not be opened, says so and can try again', async () => {
    handlers['GET /api/sales/1'] = () => json({}, 500)

    const { user } = open('/ventas/1/editar')

    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo abrir esta venta.')

    handlers['GET /api/sales/1'] = () => json(MIXED)
    await user.click(button('Intentar de nuevo'))

    expect(await screen.findByLabelText('Cantidad')).toBeTruthy()
  })
})

describe('sale form: unsaved changes', () => {
  it('leaving an untouched form asks nothing', async () => {
    const { router, user } = open('/ventas/1/editar')
    await screen.findByLabelText('Cantidad')

    await user.click(button('Volver'))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/ventas')
  })

  it('leaving a new form with nothing in it asks nothing, even after the prices load', async () => {
    handlers['GET /api/sales/last-prices'] = () => json({ A: 1000, B: 2000 })
    const { router, user } = open('/ventas/nueva')
    await waitFor(() => expect(callsTo('GET', '/api/sales/last-prices').length).toBe(1))

    await user.click(button('Volver'))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/ventas')
  })

  it('adding a blank line while editing is not a change', async () => {
    const { router, user } = open('/ventas/2/editar')
    await screen.findByLabelText('Cantidad')

    await user.click(add())
    await user.click(button('Volver'))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/ventas')
  })

  it.each([
    ['choosing a carton', (user: User) => user.click(carton15())],
    ['typing a price', (user: User) => user.type(price(), '500')],
    ['changing the quantity', (user: User) => user.type(quantity(), '5')],
    ['changing the date', (user: User) => user.click(button('Ayer'))],
  ])('%s counts as a change: Volver asks, and staying keeps it', async (_what, change) => {
    const { router, user } = open('/ventas/nueva')
    await change(user)

    await user.click(button('Volver'))

    const warning = await dialog()
    expect(warning.textContent).toContain('Tiene cambios sin guardar')
    expect(document.activeElement).toBe(within(warning).getByRole('button', { name: 'No, seguir aquí' }))

    await user.click(within(warning).getByRole('button', { name: 'No, seguir aquí' }))

    expect(router.state.location.pathname).toBe('/ventas/nueva')
  })

  it('a finished line left in the form counts as a change', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user, carton15(), '3', '1000')
    await user.click(add())

    await user.click(button('Volver'))

    expect((await dialog()).textContent).toContain('Tiene cambios sin guardar')
  })

  it('Sí, salir leaves without saving, back to the same day', async () => {
    const { router, user } = open(`/ventas/nueva?fecha=${OLD_DAY}`)
    await user.click(carton15())

    await user.click(button('Volver'))
    await user.click(within(await dialog()).getByRole('button', { name: 'Sí, salir' }))

    await waitFor(() => expect(address(router)).toBe(`/ventas?fecha=${OLD_DAY}`))
    expect(posted()).toEqual([])
  })

  it('saving does not trigger the warning', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user, carton15(), '3', '1000')

    await saveCash(user)

    const success = await dialog()
    expect(success.textContent).toContain('Venta guardada')
    expect(success.textContent).not.toContain('sin guardar')
  })
})

describe('closing the window', () => {
  const postMessage = vi.fn()

  beforeEach(() => {
    postMessage.mockClear()
    window.chrome = { webview: { postMessage } }
  })

  it('an untouched form tells the window nothing', async () => {
    open('/ventas/1/editar')
    await screen.findByLabelText('Cantidad')

    expect(postMessage).not.toHaveBeenCalled()
  })

  it('tells the window when there are changes, and when there no longer are', async () => {
    const { user } = open('/ventas/nueva')

    await user.click(button('Ayer'))
    expect(postMessage).toHaveBeenLastCalledWith('unsaved-changes')

    await user.click(button('Hoy'))
    expect(postMessage).toHaveBeenLastCalledWith('no-unsaved-changes')
  })

  it('saving clears it, once the form is gone', async () => {
    const { user } = open('/ventas/nueva')
    await fillLine(user, carton15(), '3', '1000')
    expect(postMessage).toHaveBeenLastCalledWith('unsaved-changes')

    await saveCash(user)

    await dialog()
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith('no-unsaved-changes'))
  })

  it('leaving without saving clears it', async () => {
    const { user } = open('/ventas/nueva')
    await user.click(carton15())

    await user.click(button('Volver'))
    await user.click(within(await dialog()).getByRole('button', { name: 'Sí, salir' }))

    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith('no-unsaved-changes'))
  })

  it('covers the customer form too', async () => {
    handlers['GET /api/customers'] = () => json({ items: [] })
    handlers['GET /api/customers/similar'] = () => json({ items: [] })
    const { user } = open('/clientes/nuevo')

    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    expect(postMessage).toHaveBeenLastCalledWith('unsaved-changes')

    await user.clear(screen.getByLabelText('Nombre'))
    expect(postMessage).toHaveBeenLastCalledWith('no-unsaved-changes')
  })
})

describe('sale form: deleting', () => {
  it('a new sale has nothing to delete', () => {
    open('/ventas/nueva')

    expect(screen.queryByRole('button', { name: 'Borrar venta' })).toBeNull()
  })

  async function askToDelete() {
    const opened = open('/ventas/1/editar')
    await opened.user.click(await screen.findByRole('button', { name: 'Borrar venta' }))
    return { ...opened, confirm: await dialog() }
  }

  it('asks first, naming the sale, with focus on the safe choice', async () => {
    const { confirm } = await askToDelete()

    expect(confirm.textContent).toContain('¿Borrar la venta de ₡5.000 (3 de 15 · 1 de 30)?')
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'No, cancelar' }))
    expect(callsTo('DELETE', '/api/sales/1')).toEqual([])
  })

  it('cancelling keeps the sale', async () => {
    const { router, user, confirm } = await askToDelete()

    await user.click(within(confirm).getByRole('button', { name: 'No, cancelar' }))

    expect(callsTo('DELETE', '/api/sales/1')).toEqual([])
    expect(router.state.location.pathname).toBe('/ventas/1/editar')
  })

  it('confirming deletes, says so, and returns to the day of the sale, even with unsaved changes', async () => {
    const { router, user } = open('/ventas/1/editar')
    await user.type(await screen.findByLabelText('Precio por cartón'), '9')
    await user.click(button('Borrar venta'))
    await user.click(within(await dialog()).getByRole('button', { name: 'Sí, borrar' }))

    await waitFor(() => expect(address(router)).toBe(`/ventas?fecha=${OLD_DAY}`))
    expect((await dialog()).textContent).toContain('Venta borrada.')
    expect(callsTo('DELETE', '/api/sales/1').length).toBe(1)
  })

  it('when deleting fails, says so and stays', async () => {
    handlers['DELETE /api/sales/1'] = () => json({}, 500)

    const { router, user, confirm } = await askToDelete()
    await user.click(within(confirm).getByRole('button', { name: 'Sí, borrar' }))

    await screen.findByText('No se pudo borrar la venta. Intente de nuevo.')
    expect(router.state.location.pathname).toBe('/ventas/1/editar')
  })
})
