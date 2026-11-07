import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../../routes'

const MARIA = { id: '1', name: 'María Rodríguez', phone: '8888-8888', notes: 'Casa verde', balance: 8000 }
const PEDRO = { id: '2', name: 'Pedro Solís', phone: null, notes: null, balance: 0 }

interface Call {
  method: string
  url: URL
  body: unknown
}

type Reply = (call: Call) => Response | Promise<Response>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const calls: Call[] = []
let handlers: Record<string, Reply>

// Answers by "METHOD /path"; what a test doesn't set up behaves like an empty, working API.
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

const button = (name: string) => screen.getByRole('button', { name })
const dialog = () => screen.findByRole('alertdialog')

beforeEach(() => {
  calls.length = 0
  handlers = {
    'GET /api/health': () => json({ status: 'ok', time: '2026-11-04T10:00:00' }),
    'GET /api/customers': () => json({ items: [MARIA, PEDRO], owedTotal: 8000 }),
    'GET /api/customers/similar': () => json({ items: [], owedTotal: 0 }),
    'GET /api/customers/1': () => json(MARIA),
    'GET /api/customers/1/statement': () => json({ ...MARIA, entries: [], cashPurchases: [] }),
    'POST /api/customers': () => json(MARIA, 201),
    'PUT /api/customers/1': () => json(MARIA),
    'DELETE /api/customers/1': () => new Response(null, { status: 204 }),
  }
  vi.stubGlobal('fetch', fetchMock)
})

describe('customer list', () => {
  it('shows name, phone and balance, and says when there is no phone', async () => {
    open('/clientes')

    const rows = await screen.findAllByRole('listitem')

    expect(rows.map((row) => row.textContent)).toEqual([
      'María Rodríguez8888-8888Debe ₡8.000',
      'Pedro SolísSin teléfonoAl día',
    ])
  })

  it('a row opens the account of that customer, which edits them, and Nuevo cliente opens an empty form', async () => {
    const { router, user } = open('/clientes')

    await user.click(await screen.findByRole('button', { name: /María Rodríguez/ }))
    expect(router.state.location.pathname).toBe('/clientes/1')
    await user.click(await screen.findByRole('button', { name: 'Editar cliente' }))
    expect(router.state.location.pathname).toBe('/clientes/1/editar')
    expect(await screen.findByDisplayValue('María Rodríguez')).toBeTruthy()

    await user.click(button('Volver'))
    expect(router.state.location.pathname).toBe('/clientes/1')
    await user.click(await screen.findByRole('button', { name: 'Volver' }))
    await user.click(await screen.findByRole('button', { name: 'Nuevo cliente' }))
    expect(router.state.location.pathname).toBe('/clientes/nuevo')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('')
  })

  it('says so when there are no customers yet, and still offers Nuevo cliente', async () => {
    handlers['GET /api/customers'] = () => json({ items: [] })

    open('/clientes')

    expect(await screen.findByText('Todavía no hay clientes.')).toBeTruthy()
    expect(button('Nuevo cliente')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).toBeNull()
  })

  it('searches once typing stops, sending the search without extra spaces', async () => {
    handlers['GET /api/customers'] = ({ url }) =>
      json({ items: url.searchParams.get('search') === 'ped' ? [PEDRO] : [MARIA, PEDRO] })

    const { user } = open('/clientes')
    await screen.findByRole('button', { name: /María/ })

    await user.type(screen.getByLabelText('Buscar por nombre'), ' ped ')

    await waitFor(() => expect(screen.queryByRole('button', { name: /María/ })).toBeNull())
    expect(screen.getByRole('button', { name: /Pedro/ })).toBeTruthy()

    // The first load, plus one search for the whole word: not one per letter.
    expect(callsTo('GET', '/api/customers').length).toBe(2)
  })

  it('an old answer that arrives late does not replace the newer one', async () => {
    let answerOld = (_response: Response) => {}
    handlers['GET /api/customers'] = ({ url }) => {
      const search = url.searchParams.get('search')
      if (search === 'mar') {
        return new Promise((resolve) => {
          answerOld = resolve
        })
      }
      return json({ items: search === 'pedro' ? [PEDRO] : [MARIA, PEDRO] })
    }

    const { user } = open('/clientes')
    await screen.findByRole('button', { name: /María/ })

    const input = screen.getByLabelText('Buscar por nombre')
    await user.type(input, 'mar')
    await waitFor(() => expect(callsTo('GET', '/api/customers').length).toBe(2))

    await user.clear(input)
    await user.type(input, 'pedro')
    await waitFor(() => expect(screen.queryByRole('button', { name: /María/ })).toBeNull())

    answerOld(json({ items: [MARIA] }))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screen.queryByRole('button', { name: /María/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Pedro/ })).toBeTruthy()
  })

  it('a search with no matches says so, and Borrar búsqueda brings everyone back', async () => {
    handlers['GET /api/customers'] = ({ url }) =>
      json({ items: url.searchParams.get('search') ? [] : [MARIA, PEDRO] })

    const { user } = open('/clientes')
    await screen.findByRole('button', { name: /María/ })
    const input = screen.getByLabelText('Buscar por nombre') as HTMLInputElement
    await user.type(input, 'xyz')

    expect(await screen.findByText('No se encontró ningún cliente con “xyz”.')).toBeTruthy()

    await user.click(button('Borrar búsqueda'))

    expect(input.value).toBe('')
    expect(await screen.findByRole('button', { name: /María/ })).toBeTruthy()
  })

  it('when the list can not load, says so without details and can try again', async () => {
    handlers['GET /api/customers'] = () => json({}, 500)

    const { user } = open('/clientes')

    const message = await screen.findByRole('alert')
    expect(message.textContent).toBe('No se pudo cargar la lista de clientes.')

    handlers['GET /api/customers'] = () => json({ items: [MARIA] })
    await user.click(button('Intentar de nuevo'))

    expect(await screen.findByRole('button', { name: /María/ })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('customer form: saving', () => {
  it('a new customer needs a name, and nothing is sent without one', async () => {
    const { user } = open('/clientes/nuevo')

    await user.type(screen.getByLabelText('Nombre'), '   ')
    await user.click(button('Guardar'))

    expect(screen.getByText('Escriba el nombre del cliente.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'))
    expect(callsTo('POST', '/api/customers')).toEqual([])
  })

  it('the error goes away once the name is being typed', async () => {
    const { user } = open('/clientes/nuevo')

    await user.click(button('Guardar'))
    await user.type(screen.getByLabelText('Nombre'), 'M')

    expect(screen.queryByText('Escriba el nombre del cliente.')).toBeNull()
  })

  it('a double click on Guardar saves once', async () => {
    const { user } = open('/clientes/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Ana')

    await user.dblClick(button('Guardar'))

    await dialog()
    expect(callsTo('POST', '/api/customers').length).toBe(1)
  })

  it('saves the cleaned values, confirms with a dialog, and shows the list', async () => {
    const { router, user } = open('/clientes/nuevo')

    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'))

    await user.type(screen.getByLabelText('Nombre'), '  Ana   Mora ')
    await user.type(screen.getByLabelText('Teléfono (opcional)'), ' 7777-7777 (hija) ')
    await user.type(screen.getByLabelText('Notas (opcional)'), 'Línea 1{Enter}Línea 2')
    await user.click(button('Guardar'))

    const success = await dialog()
    expect(within(success).getByText('Cliente guardado.')).toBeTruthy()
    expect(callsTo('POST', '/api/customers')[0].body).toEqual({
      name: 'Ana Mora',
      phone: '7777-7777 (hija)',
      notes: 'Línea 1\nLínea 2',
    })
    expect(router.state.location.pathname).toBe('/clientes')
  })

  it('editing loads the customer and saves over it', async () => {
    const { router, user } = open('/clientes/1/editar')

    const phone = await screen.findByLabelText('Teléfono (opcional)')
    expect((phone as HTMLInputElement).value).toBe('8888-8888')
    expect((screen.getByLabelText('Notas (opcional)') as HTMLTextAreaElement).value).toBe('Casa verde')

    await user.clear(phone)
    await user.click(button('Guardar'))

    expect(await dialog()).toBeTruthy()
    expect(callsTo('PUT', '/api/customers/1')[0].body).toEqual({
      name: 'María Rodríguez',
      phone: '',
      notes: 'Casa verde',
    })
    expect(router.state.location.pathname).toBe('/clientes/1')
  })

  it('shows what the API refuses next to its field and stays on the form', async () => {
    handlers['POST /api/customers'] = () =>
      json({ errors: { phone: ['El teléfono no puede tener más de 30 caracteres.'] } }, 400)

    const { router, user } = open('/clientes/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.click(button('Guardar'))

    expect(await screen.findByText('El teléfono no puede tener más de 30 caracteres.')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/clientes/nuevo')
  })

  it('when saving fails, says so and keeps what was typed', async () => {
    handlers['POST /api/customers'] = () => Promise.reject(new TypeError('Failed to fetch'))

    const { router, user } = open('/clientes/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.click(button('Guardar'))

    const error = await dialog()
    expect(error.textContent).toContain('No se pudo guardar el cliente.')
    expect(error.textContent).not.toMatch(/fetch|HTTP/)
    expect(router.state.location.pathname).toBe('/clientes/nuevo')
    expect((screen.getByLabelText('Nombre', { selector: 'input' }) as HTMLInputElement).value).toBe('Ana')
  })

  it('a customer who no longer exists: says so and goes back to the list', async () => {
    handlers['GET /api/customers/1'] = () => new Response(null, { status: 404 })

    const { router } = open('/clientes/1/editar')

    expect((await dialog()).textContent).toContain('Este cliente ya no existe.')
    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes'))
  })

  it('when a customer can not be opened, says so and can try again', async () => {
    handlers['GET /api/customers/1'] = () => json({}, 500)

    const { user } = open('/clientes/1/editar')

    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo abrir este cliente.')

    handlers['GET /api/customers/1'] = () => json(MARIA)
    await user.click(button('Intentar de nuevo'))

    expect(await screen.findByDisplayValue('María Rodríguez')).toBeTruthy()
  })
})

describe('customer form: similar names', () => {
  beforeEach(() => {
    handlers['GET /api/customers/similar'] = () => json({ items: [MARIA, { ...PEDRO, name: 'María' }] })
  })

  async function saveNewNamedMaria() {
    const opened = open('/clientes/nuevo')
    await opened.user.type(screen.getByLabelText('Nombre'), 'Maria')
    await opened.user.click(button('Guardar'))
    return { ...opened, warning: await dialog() }
  }

  it('asks first, naming who already exists, with focus on the safe choice', async () => {
    const { warning } = await saveNewNamedMaria()

    expect(warning.textContent).toContain('Ya existe un cliente parecido')
    expect(warning.textContent).toContain('María Rodríguez (8888-8888), María. ¿Es otra persona?')
    expect(document.activeElement).toBe(within(warning).getByRole('button', { name: 'No, revisar' }))
    expect(callsTo('POST', '/api/customers')).toEqual([])
  })

  it('No, revisar goes back to the form without saving', async () => {
    const { router, user, warning } = await saveNewNamedMaria()

    await user.click(within(warning).getByRole('button', { name: 'No, revisar' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(callsTo('POST', '/api/customers')).toEqual([])
    expect(router.state.location.pathname).toBe('/clientes/nuevo')
  })

  it('Sí, es otra persona saves it anyway', async () => {
    const { router, user, warning } = await saveNewNamedMaria()

    await user.click(within(warning).getByRole('button', { name: 'Sí, es otra persona' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes'))
    expect(callsTo('POST', '/api/customers').length).toBe(1)
  })

  it('does not ask when editing leaves the name as it was', async () => {
    const { user } = open('/clientes/1/editar')

    await user.type(await screen.findByLabelText('Notas (opcional)'), ' nueva')
    await user.click(button('Guardar'))

    await waitFor(() => expect(callsTo('PUT', '/api/customers/1').length).toBe(1))
    expect(callsTo('GET', '/api/customers/similar')).toEqual([])
  })

  it('a changed name is checked, leaving out the customer being edited', async () => {
    const { user } = open('/clientes/1/editar')

    await user.type(await screen.findByLabelText('Nombre'), ' Mora')
    await user.click(button('Guardar'))

    await dialog()
    const query = callsTo('GET', '/api/customers/similar')[0].url.searchParams
    expect(query.get('name')).toBe('María Rodríguez Mora')
    expect(query.get('excludeId')).toBe('1')
  })

  it('a failed check does not stop the save', async () => {
    handlers['GET /api/customers/similar'] = () => json({}, 500)

    const { router, user } = open('/clientes/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.click(button('Guardar'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes'))
    expect(callsTo('POST', '/api/customers').length).toBe(1)
  })
})

describe('customer form: unsaved changes', () => {
  it('leaving an untouched form asks nothing', async () => {
    const { router, user } = open('/clientes/1/editar')
    await screen.findByLabelText('Nombre')

    await user.click(button('Volver'))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/clientes/1')
  })

  it('a change that is only spaces counts as no change', async () => {
    const { router, user } = open('/clientes/1/editar')
    await user.type(await screen.findByLabelText('Teléfono (opcional)'), '   ')

    await user.click(button('Volver'))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/clientes/1')
  })

  it.each(['Volver', 'Inicio'])('%s asks first; No, seguir aquí stays with the text intact', async (exit) => {
    const { router, user } = open('/clientes/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Ana')

    await user.click(button(exit))

    const warning = await dialog()
    expect(warning.textContent).toContain('Tiene cambios sin guardar')
    expect(document.activeElement).toBe(within(warning).getByRole('button', { name: 'No, seguir aquí' }))
    expect(router.state.location.pathname).toBe('/clientes/nuevo')

    await user.click(within(warning).getByRole('button', { name: 'No, seguir aquí' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/clientes/nuevo')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Ana')
  })

  it('Sí, salir leaves without saving', async () => {
    const { router, user } = open('/clientes/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Ana')

    await user.click(button('Volver'))
    await user.click(within(await dialog()).getByRole('button', { name: 'Sí, salir' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes'))
    expect(callsTo('POST', '/api/customers')).toEqual([])
  })

  it('going back in browser history is stopped too', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/clientes', '/clientes/nuevo'], initialIndex: 1 })
    render(<RouterProvider router={router} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nombre'), 'Ana')

    void router.navigate(-1)

    expect(await dialog()).toBeTruthy()
    expect(router.state.location.pathname).toBe('/clientes/nuevo')
  })

  it('saving does not trigger the warning', async () => {
    const { router, user } = open('/clientes/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Ana')

    await user.click(button('Guardar'))

    const success = await dialog()
    expect(success.textContent).toContain('Cliente guardado.')
    expect(success.textContent).not.toContain('sin guardar')
    expect(router.state.location.pathname).toBe('/clientes')
  })
})

describe('customer form: deleting', () => {
  it('a new customer has nothing to delete', () => {
    open('/clientes/nuevo')

    expect(screen.queryByRole('button', { name: 'Borrar cliente' })).toBeNull()
  })

  async function askToDelete() {
    const opened = open('/clientes/1/editar')
    await opened.user.click(await screen.findByRole('button', { name: 'Borrar cliente' }))
    return { ...opened, confirm: await dialog() }
  }

  it('asks first, naming the customer, with focus on the safe choice', async () => {
    const { confirm } = await askToDelete()

    expect(confirm.textContent).toContain('¿Borrar a María Rodríguez? Ya no aparecerá en la lista.')
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'No, cancelar' }))
    expect(callsTo('DELETE', '/api/customers/1')).toEqual([])
  })

  it('cancelling keeps the customer', async () => {
    const { router, user, confirm } = await askToDelete()

    await user.click(within(confirm).getByRole('button', { name: 'No, cancelar' }))

    expect(callsTo('DELETE', '/api/customers/1')).toEqual([])
    expect(router.state.location.pathname).toBe('/clientes/1/editar')
  })

  it('confirming deletes, says so, and returns to the list, even with unsaved changes', async () => {
    const { router, user } = open('/clientes/1/editar')
    await user.type(await screen.findByLabelText('Notas (opcional)'), ' algo')
    await user.click(button('Borrar cliente'))
    await user.click(within(await dialog()).getByRole('button', { name: 'Sí, borrar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes'))
    expect((await dialog()).textContent).toContain('Cliente borrado.')
    expect(callsTo('DELETE', '/api/customers/1').length).toBe(1)
  })

  it('when the API refuses, shows its reason and keeps the customer open', async () => {
    const reason = 'Este cliente tiene un saldo pendiente.'
    handlers['DELETE /api/customers/1'] = () => json({ message: reason }, 409)

    const { router, user, confirm } = await askToDelete()
    await user.click(within(confirm).getByRole('button', { name: 'Sí, borrar' }))

    await screen.findByText(reason)
    expect(router.state.location.pathname).toBe('/clientes/1/editar')
    expect(button('Guardar')).toBeTruthy()
  })

  it('when deleting fails, says so and stays', async () => {
    handlers['DELETE /api/customers/1'] = () => json({}, 500)

    const { router, user, confirm } = await askToDelete()
    await user.click(within(confirm).getByRole('button', { name: 'Sí, borrar' }))

    await screen.findByText('No se pudo borrar el cliente. Intente de nuevo.')
    expect(router.state.location.pathname).toBe('/clientes/1/editar')
  })
})
