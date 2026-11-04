import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Screen } from './layout/Screen'
import { CHECK_INTERVAL_MS } from './layout/useServerStatus'
import { routes } from './routes'

const fetchMock = vi.fn<typeof fetch>()

const healthy = () => new Response(JSON.stringify({ status: 'ok', time: '2026-11-04T10:00:00' }))

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

  it.each([
    ['Ventas', '/ventas'],
    ['Gastos', '/gastos'],
    ['Resúmenes', '/resumenes'],
  ])('%s opens, says Próximamente, and Volver returns to Inicio', async (label, path) => {
    const { router, user } = open()

    await user.click(screen.getByRole('button', { name: label }))

    expect(router.state.location.pathname).toBe(path)
    expect(title()).toBe(label)
    expect(screen.getByText('Próximamente')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Volver' }))

    expect(router.state.location.pathname).toBe('/')
    expect(title()).toBe('Eggs App')
  })

  it('opening directly on a screen, as a reload does, still has a way back', async () => {
    const { router, user } = open('/gastos')

    expect(title()).toBe('Gastos')

    await user.click(screen.getByRole('button', { name: 'Volver a Inicio' }))

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
    open('/ventas')

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
    const { user } = open()
    await screen.findByText('Conectado')

    await user.click(screen.getByRole('button', { name: 'Ventas' }))

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

  it('keeps checking, and notices when the server comes back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    open()
    await screen.findByText(/Sin conexión/)

    await act(async () => {
      vi.advanceTimersByTime(CHECK_INTERVAL_MS)
    })

    await screen.findByText('Conectado')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
