import { useState, useRef, useCallback, useEffect } from 'react'
import { createPacedRevealQueue } from './pacedRevealQueue'

export { getEventDedupeKey, getEventPacingDelayMs } from './pacedRevealQueue'

/**
 * @param {object} options
 * @param {boolean} [options.enabled]
 * @param {number} [options.defaultDelayMs]
 * @param {(event: object) => void} [options.onEventRevealed] Fired when paced enqueue reveals an event (not bootstrap/catch-up).
 */
export function usePacedEventReveal({ enabled = true, defaultDelayMs = 1000, onEventRevealed } = {}) {
  const [visibleEvents, setVisibleEvents] = useState([])
  const queueRef = useRef(null)
  const onEventRevealedRef = useRef(onEventRevealed)
  onEventRevealedRef.current = onEventRevealed

  if (!queueRef.current) {
    queueRef.current = createPacedRevealQueue({
      enabled,
      defaultDelayMs,
      onVisibleChange: setVisibleEvents,
      onEventRevealed: (event) => onEventRevealedRef.current?.(event),
    })
  }

  useEffect(() => {
    const queue = queueRef.current
    return () => {
      queue?.dispose()
    }
  }, [])

  const enqueue = useCallback((event) => {
    queueRef.current?.enqueue(event)
  }, [])

  const setVisibleImmediately = useCallback((events) => {
    queueRef.current?.setVisibleImmediately(events)
  }, [])

  const appendVisibleImmediately = useCallback((eventsInput) => {
    queueRef.current?.appendVisibleImmediately(eventsInput)
  }, [])

  const reset = useCallback(() => {
    queueRef.current?.reset()
  }, [])

  return {
    visibleEvents,
    enqueue,
    setVisibleImmediately,
    appendVisibleImmediately,
    reset,
  }
}

export default usePacedEventReveal
