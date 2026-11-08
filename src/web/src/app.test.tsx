import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLayout } from './layout/AppLayout'
import { Screen } from './layout/Screen'
import { CHECK_INTERVAL_MS } from './layout/useServerStatus'
import { routes } from './routes'

const fetchMock = vi.fn<typeof fetch>()

const json = (body: unknown) => new Response(JSON.stringify(body))

const healthy = () => json({ status: 'ok', time: '2026-11-04T10:00:00', version: '1.2.3' })

const EMPTY_SUMMARY = {
  from: '2026-11-04',
  to: '2026-11-04',
  cameIn: { cash: 0, payments: 0, total: 0 },
  spent: { total: 0, byCategory: [] },
  net: 0,
  creditSold: 0,
  owedTotal: 0,
  cartons: [],
  days: [],
  bestCustomers: { top: [], othersCount: 0, othersTotal: 0, withoutCustomer: 0 },
}

/** What each page loads, empty, so every page can open. */
function emptyAnswer(input: RequestInfo | URL): Response {
  const path = new URL(String(input), 'http://app').pathname

  switch (path) {
    case '/api/sales':
      return json({ sales: [], cashTotal: 0, creditTotal: 0 })
    case '/api/payments':
      return json({ payments: [], total: 0 })
    case '/api/reports/summary':
      return json(EMPTY_SUMMARY)
    case '/api/customers':
      return json({ items: [], owedTotal: 0 })
    case '/api/expenses':
      return json({ expenses: [], total: 0 })
    case '/api/expense-categories':
      return json([])
    default:
      return healthy()
  }
}

/** The app's own layout around a page that loads nothing, for what the sidebar shows on its own. */
const quietRoutes: RouteObject[] = [{ element: <AppLayout />, children: [{ path: '*', element: <p>Página</p> }] }]

function open(path = '/', appRoutes: RouteObject[] = routes) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

const title = () => screen.getByRole('heading', { level: 1 }).textContent
const sidebar = () => screen.getByRole('navigation', { name: 'Menú principal' })
const page = (name: string) => within(sidebar()).getByRole('button', { name })
const current = () =>
  within(sidebar())
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-current') === 'page')
    .map((button) => button.textContent)

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input) => emptyAnswer(input))
  vi.stubGlobal('fetch', fetchMock)
})

describe('sidebar', () => {
  it('the app opens on Ventas, with the four pages always there by name', async () => {
    const { router } = open()

    await waitFor(() => expect(router.state.location.pathname).toBe('/ventas'))
    expect(title()).toBe('Ventas')
    expect(within(sidebar()).getByText('Eggs App')).toBeTruthy()
    expect(within(sidebar()).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Ventas',
      'Clientes',
      'Gastos',
      'Resúmenes',
    ])
    expect(current()).toEqual(['Ventas'])
  })

  it('goes to each page, and marks the one that is open', async () => {
    const { router, user } = open('/ventas')

    await user.click(page('Clientes'))
    expect(router.state.location.pathname).toBe('/clientes')
    expect(title()).toBe('Clientes')
    expect(current()).toEqual(['Clientes'])

    await user.click(page('Gastos'))
    expect(router.state.location.pathname).toBe('/gastos')
    expect(current()).toEqual(['Gastos'])

    await user.click(page('Resúmenes'))
    expect(router.state.location.pathname).toBe('/resumenes')
    expect(current()).toEqual(['Resúmenes'])

    await user.click(page('Ventas'))
    expect(router.state.location.pathname).toBe('/ventas')
    expect(current()).toEqual(['Ventas'])
  })

  it('a screen under a page keeps that page marked', () => {
    open('/clientes/nuevo')

    expect(current()).toEqual(['Clientes'])
  })

  it('an unknown address goes to Ventas', async () => {
    const { router } = open('/no-existe')

    await waitFor(() => expect(router.state.location.pathname).toBe('/ventas'))
    expect(title()).toBe('Ventas')
  })

  it('the pages themselves have nothing to go back to', async () => {
    for (const path of ['/ventas', '/clientes', '/gastos', '/resumenes']) {
      const { unmount } = render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
      expect(screen.queryByRole('button', { name: 'Volver' })).toBeNull()
      unmount()
    }
  })

  it('a screen under a page goes back to it with Volver, never through history', async () => {
    const { router, user } = open('/clientes/nuevo', [
      { path: '/clientes/nuevo', element: <Screen title="Nuevo cliente" backTo="/clientes">x</Screen> },
      { path: '*', element: null },
    ])

    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(router.state.location.pathname).toBe('/clientes')
  })

  it('a crashed screen shows a Spanish message with a way out', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Broken = () => {
      throw new Error('boom')
    }

    open('/', [{ errorElement: routes[0].errorElement, children: [{ index: true, element: <Broken /> }] }])

    expect(screen.getByText('Algo salió mal en esta pantalla.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Volver a Ventas' })).toBeTruthy()

    vi.restoreAllMocks()
  })
})

describe('server status', () => {
  it('shows Conectado on every page, at the bottom of the sidebar', async () => {
    const { user } = open('/ventas')
    await screen.findByText('Conectado')

    await user.click(page('Clientes'))
    await screen.findByText('Todavía no hay clientes.')

    expect(within(sidebar()).getByText('Conectado')).toBeTruthy()
  })

  it.each([
    ['a server error', async () => new Response('', { status: 500 })],
    ['no answer', async () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('says what to do on %s, without technical details', async (_case, respond) => {
    fetchMock.mockImplementation(respond)

    open('/', quietRoutes)

    const status = await screen.findByText('Sin conexión. Cierre y vuelva a abrir Eggs App.')
    expect(status.textContent).not.toMatch(/HTTP|fetch/)
  })

  it('shows the version as plain text, and keeps it while disconnected', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    open('/', quietRoutes)

    const version = await screen.findByText('Versión 1.2.3')
    expect(sidebar().contains(version)).toBe(true)
    expect(version.closest('button')).toBeNull()

    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await act(async () => {
      vi.advanceTimersByTime(CHECK_INTERVAL_MS)
    })

    await screen.findByText(/Sin conexión/)
    expect(screen.getByText('Versión 1.2.3')).toBeTruthy()
    vi.useRealTimers()
  })

  it('shows no version before the first answer', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    open('/', quietRoutes)

    expect(screen.getByText('Conectando…')).toBeTruthy()
    expect(screen.queryByText(/Versión/)).toBeNull()
  })

  it('keeps checking, and notices when the server comes back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    open('/', quietRoutes)
    await screen.findByText(/Sin conexión/)

    await act(async () => {
      vi.advanceTimersByTime(CHECK_INTERVAL_MS)
    })

    await screen.findByText('Conectado')
    expect(fetchMock.mock.calls.filter(([input]) => input === '/api/health')).toHaveLength(2)
  })
})

describe('backup status', () => {
  const NOW = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  const todayAt = (hours: number, minutes: number) =>
    `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}-${pad(NOW.getDate())}T${pad(hours)}:${pad(minutes)}:00`

  function serve(status: object, afterRetry?: object) {
    fetchMock.mockImplementation(async (input, init) => {
      if (input === '/api/backups' && init?.method === 'POST') {
        return json(afterRetry)
      }

      return input === '/api/backups/status' ? json(status) : healthy()
    })
  }

  const fine = { enabled: true, lastGoodAt: todayAt(8, 15), warning: false, secondCopy: null }

  it('shows the last good backup calmly, with nothing to press', async () => {
    serve(fine)
    open('/', quietRoutes)

    await screen.findByText('Último respaldo: hoy 8:15 a. m.')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Intentar de nuevo' })).toBeNull()
  })

  it('shows nothing when the API makes no backups, as in development', async () => {
    serve({ enabled: false, lastGoodAt: null, warning: false, secondCopy: null })
    open('/', quietRoutes)

    await screen.findByText('Conectado')
    expect(screen.queryByText(/respaldo/)).toBeNull()
  })

  it('warns in plain Spanish and retries once per click', async () => {
    serve({ ...fine, warning: true }, fine)
    const { user } = open('/', quietRoutes)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      'No se pudo guardar el respaldo. El último es de hoy 8:15 a. m. Por favor llame a Billy.',
    )

    await user.dblClick(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    await screen.findByText('Último respaldo: hoy 8:15 a. m.')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })

  it('warns without a date when there has never been a good backup', async () => {
    serve({ enabled: true, lastGoodAt: null, warning: true, secondCopy: null })
    open('/', quietRoutes)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No se pudo guardar el respaldo. Por favor llame a Billy.',
    )
  })

  it.each([
    [true, 'La copia en OneDrive no se está haciendo. Por favor llame a Billy.'],
    [false, 'La segunda copia del respaldo no se está haciendo. Por favor llame a Billy.'],
  ])('warns about the second copy (OneDrive: %s)', async (isOneDrive, text) => {
    serve({ ...fine, secondCopy: { isOneDrive, lastAt: null, warning: true } })
    open('/', quietRoutes)

    expect((await screen.findByRole('alert')).textContent).toBe(text)
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeTruthy()
  })

  it('a second copy that is fine adds nothing', async () => {
    serve({ ...fine, secondCopy: { isOneDrive: true, lastAt: fine.lastGoodAt, warning: false } })
    open('/', quietRoutes)

    await screen.findByText('Último respaldo: hoy 8:15 a. m.')
    expect(screen.queryByText(/OneDrive/)).toBeNull()
  })

  it('hides the backup line while disconnected, since it could be out of date', async () => {
    fetchMock.mockImplementation(async (input) =>
      input === '/api/backups/status' ? json(fine) : Promise.reject(new TypeError('Failed to fetch')),
    )
    open('/', quietRoutes)

    await screen.findByText(/Sin conexión/)
    expect(screen.queryByText(/respaldo/)).toBeNull()
  })
})
