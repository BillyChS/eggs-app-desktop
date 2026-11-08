import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import { routes } from '../routes'

/** A request the screens made, with its body already read. */
export interface Call {
  method: string
  url: URL
  body: unknown
}

export type Reply = (call: Call) => Response | Promise<Response>

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

export const noContent = () => new Response(null, { status: 204 })

/** GET /api/reports/summary of a period with nothing in it: what Ventas shows after a test leaves a form. */
export const EMPTY_SUMMARY = {
  cameIn: { cash: 0, payments: 0, total: 0 },
  spent: { total: 0, byCategory: [] },
  net: 0,
  creditSold: 0,
  owedTotal: 0,
  cartons: [],
  days: [],
  bestCustomers: { top: [], othersCount: 0, othersTotal: 0, withoutCustomer: 0 },
}

/**
 * A fake API: answers by "METHOD /path" from the handlers given, and remembers every call. Anything without a
 * handler answers {}.
 */
export function fakeApi() {
  const calls: Call[] = []
  const handlers: Record<string, Reply> = {}

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://app')
    const method = init?.method ?? 'GET'
    const call = { method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    return handlers[`${method} ${url.pathname}`]?.(call) ?? json({})
  })

  return {
    calls,
    handlers,
    /** Starts over with these handlers, and puts the fake in place of fetch. */
    reset(next: Record<string, Reply>) {
      calls.length = 0
      for (const key of Object.keys(handlers)) {
        delete handlers[key]
      }
      Object.assign(handlers, next)
      vi.stubGlobal('fetch', fetchMock)
    },
    callsTo: (method: string, path: string) =>
      calls.filter((call) => call.method === method && call.url.pathname === path),
  }
}

/** The whole app, at an address. */
export function openApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

export type AppRouter = ReturnType<typeof openApp>['router']
export type User = ReturnType<typeof openApp>['user']

export const addressOf = (router: AppRouter) => router.state.location.pathname + router.state.location.search
