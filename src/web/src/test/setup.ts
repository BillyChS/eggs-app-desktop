import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

/*
 * A screen that crashes fails its test, every time. Without this, a crash on a screen a test only passes through (an
 * answer the fake API doesn't have, say) is just noise in the log, and fails the test only when it happens to land
 * before the test's last check: a flaky test. A test that means to crash a screen silences console.error itself.
 */
const RENDER_CRASH = 'React Router caught the following error during render'
const realConsoleError = console.error
let crashes: string[] = []

beforeEach(() => {
  crashes = []
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith(RENDER_CRASH)) {
      crashes.push(String(args[1]))
    }

    realConsoleError(...args)
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  console.error = realConsoleError

  if (crashes.length > 0) {
    throw new Error(`A screen crashed during the test: ${crashes.join('; ')}`)
  }
})

// jsdom has no modal dialogs. This only makes them visible: focus trapping and Esc are checked in the real app.
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '')
}

HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open')
}
