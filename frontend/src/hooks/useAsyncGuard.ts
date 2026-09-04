import { useRef, useState } from 'react'

/**
 * Runs one async action at a time, synchronously rejecting a second
 * call that comes in while the first is still in flight. `busy` (React
 * state) drives disabling the trigger button in the UI, but state
 * updates land on the *next* render -- a second click dispatched before
 * that render (a fast double-click, or two elements both wired to the
 * same handler) would otherwise still go through and fire the action
 * twice. The guard is a ref, checked and set before anything else runs,
 * so it's already in effect for that same synchronous tick.
 */
export function useAsyncGuard() {
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  async function run(fn: () => Promise<void>): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await fn()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return { busy, run }
}
