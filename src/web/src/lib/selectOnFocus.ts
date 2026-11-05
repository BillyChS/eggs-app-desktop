import type { InputHTMLAttributes } from 'react'

const notClickedYet = new WeakSet<HTMLInputElement>()

/**
 * Props that select a field's value when it gets focus, so typing replaces a value the field started with: a quantity
 * of 1 doesn't become 13. Letting go of the mouse would drop the selection, so the first click after focus keeps it,
 * even if focus arrived some other way before. A second click places the caret, to change a single digit.
 */
export const selectOnFocus: InputHTMLAttributes<HTMLInputElement> = {
  onFocus: (event) => {
    event.currentTarget.select()
    notClickedYet.add(event.currentTarget)
  },
  onMouseUp: (event) => {
    if (notClickedYet.delete(event.currentTarget)) {
      // Without preventDefault, the browser drops the selection right after this, if the field already had focus.
      event.preventDefault()
      event.currentTarget.select()
    }
  },
  onInput: (event) => {
    notClickedYet.delete(event.currentTarget)
  },
}
