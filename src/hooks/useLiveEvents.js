import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { liveApi } from '../api/client'
import {
  normalizeLiveEvent,
  LIVE_SSE_EVENT_TYPES,
  dedupeLiveEventsBySeq,
} from '../utils/liveEventModel'

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]

const MAX_BUFFER = 200

/**
 * Wire-level duplicate guard keyed on seq. During the named→data-only SSE
 * transition a backend may deliver the same event twice (once via a named
 * `event: <type>` frame, once via a default frame); both land here, and
 * without this guard `onEvent` fires twice per event. Bounded FIFO so a
 * long-lived stream doesn't grow the set forever.
 * @param {number} [limit]
 */
export function createSeenSeqTracker(limit = 512) {
  const seen = new Set()
  const fifo = []
  return {
    /** @returns {boolean} true if this seq was already seen (duplicate) */
    check(seq) {
      const n = Number(seq)
      if (!Number.isFinite(n) || n <= 0) return false
      if (seen.has(n)) return true
      seen.add(n)
      fifo.push(n)
      if (fifo.length > limit) seen.delete(fifo.shift())
      return false
    },
    clear() {
      seen.clear()
      fifo.length = 0
    },
  }
}

/**
 * @param {object} options
 * @param {number|null} [options.tournamentId]
 * @param {number|null} [options.fixtureId]
 * @param {string|null} [options.category] - highlights | goals | shootout | cards | flow
 * @param {number|null} [options.seedAfterSeq] - highest seq from bootstrap; reconnect picks up afterSeq
 * @param {(event: object) => void} [options.onEvent]
 * @param {boolean} [options.enabled]
 */
export function useLiveEvents({
  tournamentId = null,
  fixtureId = null,
  category = null,
  seedAfterSeq = null,
  onEvent = null,
  enabled = true,
} = {}) {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [events, setEvents] = useState([])

  const eventSourceRef = useRef(null)
  const lastSeqRef = useRef(0)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)
  const mountedRef = useRef(true)
  const typedListenersRef = useRef([])
  const connectRef = useRef(() => {})
  const seenSeqTrackerRef = useRef(null)
  if (seenSeqTrackerRef.current == null) {
    seenSeqTrackerRef.current = createSeenSeqTracker()
  }

  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const getLastSeq = useCallback(() => lastSeqRef.current, [])

  const setLastSeq = useCallback((seq) => {
    const n = Number(seq)
    if (!Number.isFinite(n) || n < 0) return
    if (n > lastSeqRef.current) {
      lastSeqRef.current = n
    }
  }, [])

  const pushEvent = useCallback((normalized) => {
    if (!normalized || !mountedRef.current) return

    // Drop wire-level duplicates (named + default frame for the same event
    // during the SSE transition) before they reach onEvent/consumers.
    if (normalized.type !== 'connected' && seenSeqTrackerRef.current.check(normalized.seq)) {
      return
    }

    console.log('[SSE] event', normalized.type, 'seq', normalized.seq, 'fixtureId', normalized.fixtureId)

    if (normalized.type !== 'connected' && normalized.seq > 0) {
      lastSeqRef.current = Math.max(lastSeqRef.current, normalized.seq)
    } else if (normalized.type === 'connected' && normalized.seq > 0) {
      lastSeqRef.current = Math.max(lastSeqRef.current, normalized.seq)
    }

    if (normalized.type !== 'connected') {
      setEvents((prev) => {
        const next = dedupeLiveEventsBySeq([...prev, normalized])
        return next.slice(-MAX_BUFFER)
      })
    }

    if (onEventRef.current) {
      onEventRef.current(normalized)
    }
  }, [])

  const handleSsePayload = useCallback(
    (sseType, rawData) => {
      let parsed = rawData
      if (typeof rawData === 'string') {
        try {
          parsed = JSON.parse(rawData)
        } catch {
          console.warn('[SSE] Non-JSON payload for', sseType)
          return
        }
      }
      const normalized = normalizeLiveEvent(parsed, { sseType: sseType === 'message' ? undefined : sseType })
      if (normalized) {
        pushEvent(normalized)
      }
    },
    [pushEvent]
  )

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    const es = eventSourceRef.current
    if (es) {
      for (const { type, fn } of typedListenersRef.current) {
        es.removeEventListener(type, fn)
      }
      typedListenersRef.current = []
      es.onmessage = null
      es.onerror = null
      es.close()
      eventSourceRef.current = null
    }

    setConnected(false)
    setConnecting(false)
  }, [])

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return

    disconnect()

    setConnecting(true)
    setError(null)

    const params = {}
    if (tournamentId) params.tournamentId = tournamentId
    if (fixtureId) params.fixtureId = fixtureId
    if (category) params.category = category
    if (lastSeqRef.current > 0) params.afterSeq = lastSeqRef.current

    const url = liveApi.getEventsStreamUrl(params)
    console.log('[SSE] Connecting to:', url)

    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      setConnecting(false)
      setError(null)
      reconnectAttemptRef.current = 0
    }

    // Legacy compatibility only: older backends send named SSE frames
    // (`event: <type>`), which EventSource delivers solely to listeners
    // registered for that exact name. Current backends send data-only
    // frames handled by onmessage below, so these listeners are NOT the
    // delivery gate — new event types flow through onmessage without
    // touching LIVE_SSE_EVENT_TYPES. Duplicate delivery during transition
    // is suppressed in pushEvent via the seen-seq tracker.
    const listeners = []
    for (const type of LIVE_SSE_EVENT_TYPES) {
      const fn = (e) => {
        if (!mountedRef.current) return
        handleSsePayload(type, e.data)
      }
      eventSource.addEventListener(type, fn)
      listeners.push({ type, fn })
    }
    typedListenersRef.current = listeners

    // Primary path: default (un-named) SSE frames. The event type is read
    // from the JSON payload by normalizeLiveEvent, so unknown/new backend
    // types are received without any frontend whitelist change.
    eventSource.onmessage = (event) => {
      if (!mountedRef.current) return
      handleSsePayload('message', event.data)
    }

    eventSource.onerror = () => {
      if (!mountedRef.current) return

      disconnect()

      const delay =
        RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)]
      setError(`Connection lost. Reconnecting in ${delay / 1000}s...`)
      reconnectAttemptRef.current++

      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connectRef.current()
        }
      }, delay)
    }
  }, [
    enabled,
    tournamentId,
    fixtureId,
    category,
    disconnect,
    handleSsePayload,
  ])

  useLayoutEffect(() => {
    connectRef.current = connect
  }, [connect])

  const reconnect = useCallback(
    (clearHistory = false) => {
      if (clearHistory) {
        lastSeqRef.current = 0
        // Full replay expected after seq reset — forget seen seqs or the
        // replayed catchup events would all be dropped as duplicates.
        seenSeqTrackerRef.current.clear()
        setEvents([])
      }
      reconnectAttemptRef.current = 0
      disconnect()
      connect()
    },
    [connect, disconnect]
  )

  const clearEvents = useCallback(() => setEvents([]), [])

  useEffect(() => {
    if (seedAfterSeq != null && Number(seedAfterSeq) > lastSeqRef.current) {
      lastSeqRef.current = Number(seedAfterSeq)
    }
  }, [seedAfterSeq])

  // Own the EventSource lifecycle. Depending on `connect` directly would
  // tear down + rebuild the stream every time the callback identity flips
  // (e.g. when an upstream prop wobble recreates a closure), and during
  // the cleanup gap any events arriving on the closing socket are dropped.
  // Track the actual params instead and call the latest connect via ref.
  useEffect(() => {
    mountedRef.current = true

    if (enabled) {
      connectRef.current()
    }

    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [enabled, tournamentId, fixtureId, category, disconnect])

  return {
    connected,
    connecting,
    error,
    events,
    reconnect,
    disconnect,
    getLastSeq,
    setLastSeq,
    clearEvents,
  }
}

export default useLiveEvents
