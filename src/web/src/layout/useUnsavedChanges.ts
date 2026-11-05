import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'
import { tellWindowAboutUnsavedChanges } from '../services/desktopShell'

/**
 * Stops any move to another screen while there are unsaved changes: Volver, Inicio, and the keyboard's back shortcut.
 * The window's X doesn't pass through the page's navigation, so the window is told, and it asks by itself.
 */
export function useUnsavedChanges(hasChanges: boolean) {
  // A ref, because a screen that just saved navigates right away, before a state change would have taken effect.
  const allowed = useRef(false)

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges && !allowed.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!hasChanges) {
      return
    }

    tellWindowAboutUnsavedChanges(true)
    return () => tellWindowAboutUnsavedChanges(false)
  }, [hasChanges])

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
