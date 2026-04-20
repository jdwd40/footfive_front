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

  useEffect(() => {
    mountedRef.current = true

    if (enabled) {
      connect()
    }

    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [enabled, connect, disconnect])

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
