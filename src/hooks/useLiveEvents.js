import { useState, useEffect, useRef, useCallback } from 'react'
import { liveApi } from '../api/client'

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000] // Exponential backoff

/**
 * Hook for managing SSE connection to live events stream
 * Handles connection, reconnection with catchup, and event processing
 */
export function useLiveEvents({
  tournamentId = null,
  fixtureId = null,
  onEvent = null,
  enabled = true
}) {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [events, setEvents] = useState([])

  const eventSourceRef = useRef(null)
  const lastSeqRef = useRef(0)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)
  const mountedRef = useRef(true)
  const prevTournamentIdRef = useRef(tournamentId)

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setConnecting(true)
    setError(null)

    // Build URL with optional catchup sequence
    const params = {}
    if (tournamentId) params.tournamentId = tournamentId
    if (fixtureId) params.fixtureId = fixtureId
    if (lastSeqRef.current > 0) params.afterSeq = lastSeqRef.current

    const url = liveApi.getEventsStreamUrl(params)
    console.log('[SSE] Connecting to:', url)

    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      if (!mountedRef.current) return
      console.log('[SSE] Connected')
      setConnected(true)
      setConnecting(false)
      setError(null)
      reconnectAttemptRef.current = 0 // Reset reconnect counter on successful connection
    }

    eventSource.onmessage = (event) => {
      if (!mountedRef.current) return

      try {
        console.log('[SSE] Raw message received:', event.data?.substring(0, 200))
        const data = JSON.parse(event.data)
        console.log('[SSE] Parsed event:', data.type, data)

        // Track sequence for reconnection catchup
        if (data.seq) {
          lastSeqRef.current = data.seq
        }

        // Add to events buffer (keep last 100)
        setEvents(prev => {
          const updated = [...prev, data]
          return updated.slice(-100)
        })

        // Call event handler if provided
        if (onEvent) {
          onEvent(data)
        }
      } catch (err) {
        console.error('[SSE] Failed to parse event:', err, 'Raw:', event.data)
      }
    }

    eventSource.onerror = (err) => {
      if (!mountedRef.current) return

      console.error('[SSE] Error:', err)
      setConnected(false)
      setConnecting(false)

      // Close the errored connection
      eventSource.close()
      eventSourceRef.current = null

      // Schedule reconnection with exponential backoff
      const delay = RECONNECT_DELAYS[
        Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)
      ]

      setError(`Connection lost. Reconnecting in ${delay / 1000}s...`)
      reconnectAttemptRef.current++

      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect()
        }
      }, delay)
    }
  }, [enabled, tournamentId, fixtureId, onEvent])

  // Disconnect from SSE stream
  const disconnect = useCallback(() => {
    console.log('[SSE] Disconnecting')

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setConnected(false)
    setConnecting(false)
  }, [])

  // Manual reconnect (clears sequence to get fresh data)
  const reconnect = useCallback((clearHistory = false) => {
    if (clearHistory) {
      lastSeqRef.current = 0
      setEvents([])
    }
    reconnectAttemptRef.current = 0
    disconnect()
    connect()
  }, [connect, disconnect])

  // Get last sequence number (useful for store to track position)
  const getLastSeq = useCallback(() => lastSeqRef.current, [])

  // Clear events buffer
  const clearEvents = useCallback(() => setEvents([]), [])

  // Effect: Connect on mount, disconnect on unmount
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

  // Effect: Reconnect when tournament changes
  useEffect(() => {
    // Only reconnect if tournamentId actually changed (not on initial render)
    if (prevTournamentIdRef.current !== tournamentId && tournamentId) {
      console.log('[SSE] Tournament changed, reconnecting...')
      prevTournamentIdRef.current = tournamentId
      if (enabled && eventSourceRef.current) {
        lastSeqRef.current = 0
        disconnect()
        setTimeout(() => connect(), 100)
      }
    }
    prevTournamentIdRef.current = tournamentId
  }, [tournamentId, enabled, disconnect, connect])

  return {
    connected,
    connecting,
    error,
    events,
    reconnect,
    disconnect,
    getLastSeq,
    clearEvents,
  }
}

export default useLiveEvents

