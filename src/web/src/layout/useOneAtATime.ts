import { useRef } from 'react'

/**
 * Ignores a second click while the first is working. Buttons stay enabled: disabling the focused button would lose
 * keyboard focus, and the local API answers too fast for a disabled look to mean anything.
 */
export function useOneAtATime() {
  const busy = useRef(false)
  // The API can answer before the screen has changed, and a double click's second click would then save a copy.
  const finished = useRef(false)

  return {
    run: async (work: () => Promise<void>) => {
      if (busy.current || finished.current) {
        return
      }

      busy.current = true

      try {
        await work()
      } finally {
        busy.current = false
      }
    },
    /** Call when the screen's work is done and it's about to leave: nothing else may run. */
    finish: () => {
      finished.current = true
    },
  }
}
