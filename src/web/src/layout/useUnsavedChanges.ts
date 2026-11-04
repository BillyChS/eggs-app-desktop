import { useRef } from 'react'
import { useBlocker } from 'react-router'

/**
 * Stops any move to another screen while there are unsaved changes: Volver, Inicio, and the keyboard's back shortcut.
 * Closing the window and reloading aren't covered: the window's X doesn't pass through the page's navigation.
 */
export function useUnsavedChanges(hasChanges: boolean) {
  // A ref, because a screen that just saved navigates right away, before a state change would have taken effect.
  const allowed = useRef(false)

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges && !allowed.current && currentLocation.pathname !== nextLocation.pathname,
  )

  return {
    isAsking: blocker.state === 'blocked',
    stay: () => blocker.reset?.(),
    leave: () => blocker.proceed?.(),
    /** Call before navigating away after a save or delete: there's nothing left to lose. */
    allowLeaving: () => {
      allowed.current = true
    },
  }
}
