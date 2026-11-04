import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// jsdom has no modal dialogs. This only makes them visible: focus trapping and Esc are checked in the real app.
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '')
}

HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open')
}
