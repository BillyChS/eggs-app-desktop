import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Screen } from './layout/Screen'
import { CHECK_INTERVAL_MS } from './layout/useServerStatus'
import { routes } from './routes'

const fetchMock = vi.fn<typeof fetch>()

const healthy = () =>
  new Response(JSON.stringify({ status: 'ok', time: '2026-11-04T10:00:00', version: '1.2.3' }))

function open(path = '/', appRoutes: RouteObject[] = routes) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

const title = () => screen.getByRole('heading', { level: 1 }).textContent

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => healthy())
  vi.stubGlobal('fetch', fetchMock)
})

describe('navigation', () => {
  it('Inicio offers the four modules and nothing to go back to', async () => {
    open()
    await screen.findByText('Conectado')

    expect(title()).toBe('Eggs App')
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Ventas',
      'Clientes',
      'Gastos',
      'Resúmenes',
    ])
  })

  it('opening directly on a one-level screen, as a reload does, has Volver back to Inicio', async () => {
    const { router, user } = open('/clientes', [
      { path: '/clientes', element: <Screen title="Clientes" backTo="/">x</Screen> },
      { path: '*', element: null },
    ])

    expect(title()).toBe('Clientes')
    await user.click(screen.getByRole('button', { name: 'Volver' }))

    expect(router.state.location.pathname).toBe('/')
  })

  it('an unknown address goes to Inicio', async () => {
    const { router } = open('/no-existe')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(title()).toBe('Eggs App')
  })

  it('a deeper screen goes back to its parent and also offers Inicio', async () => {
    const { router, user } = open('/ventas/nueva', [
      { path: '/ventas/nueva', element: <Screen title="Nueva venta" backTo="/ventas">x</Screen> },
      { path: '*', element: null },
    ])

    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(router.state.location.pathname).toBe('/ventas')

    await act(() => router.navigate('/ventas/nueva'))
    await user.click(screen.getByRole('button', { name: 'Inicio' }))
    expect(router.state.location.pathname).toBe('/')
  })

  it('a one-level screen has no separate Inicio button', () => {
    open('/clientes', [{ path: '/clientes', element: <Screen title="Clientes" backTo="/">x</Screen> }])

    expect(screen.queryByRole('button', { name: 'Inicio' })).toBeNull()
  })

  it('a crashed screen shows a Spanish message with a way out', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Broken = () => {
      throw new Error('boom')
    }

    open('/', [{ errorElement: routes[0].errorElement, children: [{ index: true, element: <Broken /> }] }])

    expect(screen.getByText('Algo salió mal en esta pantalla.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Volver a Inicio' })).toBeTruthy()

    vi.restoreAllMocks()
  })
})

describe('server status', () => {
  it('shows Conectado on every screen', async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).startsWith('/api/customers')
        ? new Response(JSON.stringify({ items: [], owedTotal: 0 }))
        : healthy(),
    )
    const { user } = open()
    await screen.findByText('Conectado')

    await user.click(screen.getByRole('button', { name: 'Clientes' }))
    await screen.findByText('Todavía no hay clientes.')

    expect(screen.getByText('Conectado')).toBeTruthy()
  })

  it.each([
    ['a server error', async () => new Response('', { status: 500 })],
    ['no answer', async () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('says what to do on %s, without technical details', async (_case, respond) => {
    fetchMock.mockImplementation(respond)

    open()

    const status = await screen.findByText('Sin conexión. Cierre y vuelva a abrir Eggs App.')
    expect(status.textContent).not.toMatch(/HTTP|fetch/)
  })

  it('shows the version as plain text, and keeps it while disconnected', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    open()

    const version = await screen.findByText('Versión 1.2.3')
    expect(version.closest('footer')).toBeTruthy()
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
    open()

    expect(screen.getByText('Conectando…')).toBeTruthy()
    expect(screen.queryByText(/Versión/)).toBeNull()
  })

  it('keeps checking, and notices when the server comes back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    open()
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
        return new Response(JSON.stringify(afterRetry))
      }

      return input === '/api/backups/status' ? new Response(JSON.stringify(status)) : healthy()
    })
  }

  const fine = { enabled: true, lastGoodAt: todayAt(8, 15), warning: false, secondCopy: null }

  it('shows the last good backup calmly, with nothing to press', async () => {
    serve(fine)
    open()

    await screen.findByText('Último respaldo: hoy 8:15 a. m.')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Intentar de nuevo' })).toBeNull()
  })

  it('shows nothing when the API makes no backups, as in development', async () => {
    serve({ enabled: false, lastGoodAt: null, warning: false, secondCopy: null })
    open()

    await screen.findByText('Conectado')
    expect(screen.queryByText(/respaldo/)).toBeNull()
  })

  it('warns in plain Spanish and retries once per click', async () => {
    serve({ ...fine, warning: true }, fine)
    const { user } = open()

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
    open()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No se pudo guardar el respaldo. Por favor llame a Billy.',
    )
  })

  it.each([
    [true, 'La copia en OneDrive no se está haciendo. Por favor llame a Billy.'],
    [false, 'La segunda copia del respaldo no se está haciendo. Por favor llame a Billy.'],
  ])('warns about the second copy (OneDrive: %s)', async (isOneDrive, text) => {
    serve({ ...fine, secondCopy: { isOneDrive, lastAt: null, warning: true } })
    open()

    expect((await screen.findByRole('alert')).textContent).toBe(text)
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeTruthy()
  })

  it('a second copy that is fine adds nothing', async () => {
    serve({ ...fine, secondCopy: { isOneDrive: true, lastAt: fine.lastGoodAt, warning: false } })
    open()

    await screen.findByText('Último respaldo: hoy 8:15 a. m.')
    expect(screen.queryByText(/OneDrive/)).toBeNull()
  })

  it('hides the backup line while disconnected, since it could be out of date', async () => {
    fetchMock.mockImplementation(async (input) =>
      input === '/api/backups/status'
        ? new Response(JSON.stringify(fine))
        : Promise.reject(new TypeError('Failed to fetch')),
    )
    open()

    await screen.findByText(/Sin conexión/)
    expect(screen.queryByText(/respaldo/)).toBeNull()
  })
})
