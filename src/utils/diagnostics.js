/**
 * Diagnostic utilities for troubleshooting live events SSE connection
 * 
 * Usage in browser console:
 *   import { runDiagnostics } from './utils/diagnostics'
 *   runDiagnostics()
 * 
 * Or copy/paste the diagnostic functions into browser console
 */

const API_BASE = 'https://jwd1.xyz/api'

/**
 * Diagnostic 1: Check if SSE connection to /api/live/events works
 * Should get a 'connected' event immediately
 */
export async function checkSSEConnection() {
  console.log('=== Diagnostic 1: SSE Connection Test ===')
  
  return new Promise((resolve) => {
    const url = `${API_BASE}/live/events`
    console.log(`[SSE] Attempting to connect to: ${url}`)
    
    const eventSource = new EventSource(url)
    let connected = false
    let eventsReceived = 0
    const events = []
    const timeout = setTimeout(() => {
      eventSource.close()
      resolve({
        success: connected,
        connected,
        eventsReceived,
        events,
        error: connected ? null : 'Timeout: No connection event received within 5 seconds',
        url
      })
    }, 5000)
    
    eventSource.onopen = () => {
      console.log('[SSE] ✅ Connection opened!')
      connected = true
      clearTimeout(timeout)
      setTimeout(() => {
        eventSource.close()
        resolve({
          success: true,
          connected: true,
          eventsReceived,
          events,
          error: null,
          url
        })
      }, 2000) // Wait 2 seconds to see if we get any events
    }
    
    eventSource.onmessage = (event) => {
      eventsReceived++
      try {
        const data = JSON.parse(event.data)
        events.push({ type: event.type || 'message', data, timestamp: new Date().toISOString() })
        console.log(`[SSE] Event ${eventsReceived}:`, event.type || 'message', data)
      } catch (e) {
        events.push({ type: event.type || 'message', raw: event.data, timestamp: new Date().toISOString() })
        console.log(`[SSE] Event ${eventsReceived} (raw):`, event.data)
      }
    }
    
    eventSource.onerror = (error) => {
      console.error('[SSE] ❌ Connection error:', error)
      clearTimeout(timeout)
      eventSource.close()
      resolve({
        success: false,
        connected: false,
        eventsReceived,
        events,
        error: 'SSE connection error',
        url
      })
    }
  })
}

/**
 * Diagnostic 2: Check if matches are running
 * GET /api/live/status
 */
export async function checkLiveStatus() {
  console.log('=== Diagnostic 2: Live Status Check ===')
  
  try {
    const response = await fetch(`${API_BASE}/live/status`)
    const data = await response.json()
    
    console.log('[Status] ✅ Response received:', data)
    
    return {
      success: true,
      status: response.status,
      data,
      tournament: data.tournament,
      simulation: data.simulation,
      hasActiveMatches: data.tournament?.state && 
        ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'].includes(data.tournament.state),
      error: null
    }
  } catch (error) {
    console.error('[Status] ❌ Error:', error)
    return {
      success: false,
      error: error.message,
      data: null
    }
  }
}

/**
 * Diagnostic 3: Check what filters frontend is passing
 * Check tournamentId and fixtureId usage
 */
export function checkFrontendFilters() {
  console.log('=== Diagnostic 3: Frontend Filter Usage ===')
  
  // Check localStorage/sessionStorage for any stored IDs
  const storedTournamentId = localStorage.getItem('tournamentId') || sessionStorage.getItem('tournamentId')
  const storedFixtureId = localStorage.getItem('fixtureId') || sessionStorage.getItem('fixtureId')
  
  // Check if we can access React state (if running in browser)
  const info = {
    storedTournamentId,
    storedFixtureId,
    apiBase: API_BASE,
    note: 'To check actual filter values in use, inspect the EventSource connection in Network tab'
  }
  
  console.log('[Filters] Frontend filter info:', info)
  
  return info
}

/**
 * Diagnostic 3b: Test SSE with different filter combinations
 */
export async function testSSEWithFilters(tournamentId = null, fixtureId = null) {
  console.log(`=== Diagnostic 3b: SSE with Filters (tournamentId=${tournamentId}, fixtureId=${fixtureId}) ===`)
  
  const params = new URLSearchParams()
  if (tournamentId) params.set('tournamentId', tournamentId)
  if (fixtureId) params.set('fixtureId', fixtureId)
  
  const url = `${API_BASE}/live/events${params.toString() ? `?${params.toString()}` : ''}`
  console.log(`[SSE Filters] Connecting to: ${url}`)
  
  return new Promise((resolve) => {
    const eventSource = new EventSource(url)
    let connected = false
    let eventsReceived = 0
    const events = []
    const timeout = setTimeout(() => {
      eventSource.close()
      resolve({
        success: connected,
        connected,
        eventsReceived,
        events,
        url,
        filters: { tournamentId, fixtureId },
        error: connected ? null : 'Timeout: No connection event received'
      })
    }, 5000)
    
    eventSource.onopen = () => {
      console.log('[SSE Filters] ✅ Connected!')
      connected = true
      clearTimeout(timeout)
      setTimeout(() => {
        eventSource.close()
        resolve({
          success: true,
          connected: true,
          eventsReceived,
          events,
          url,
          filters: { tournamentId, fixtureId },
          error: null
        })
      }, 3000)
    }
    
    eventSource.onmessage = (event) => {
      eventsReceived++
      try {
        const data = JSON.parse(event.data)
        events.push({ type: event.type || 'message', data })
        console.log(`[SSE Filters] Event ${eventsReceived}:`, data.type || 'message')
      } catch (e) {
        events.push({ type: event.type || 'message', raw: event.data })
      }
    }
    
    eventSource.onerror = (error) => {
      console.error('[SSE Filters] ❌ Error:', error)
      clearTimeout(timeout)
      eventSource.close()
      resolve({
        success: false,
        connected: false,
        eventsReceived,
        events,
        url,
        filters: { tournamentId, fixtureId },
        error: 'SSE connection error'
      })
    }
  })
}

/**
 * Diagnostic 4: Check nginx/proxy configuration
 * (This is a manual check, but we can document what to look for)
 */
export function checkProxyConfig() {
  console.log('=== Diagnostic 4: Proxy Configuration Check ===')
  
  const checks = {
    nginxConfig: 'Check deploy/nginx-jwd1.xyz.conf for SSE-specific settings',
    sseBuffering: 'Check if nginx has proxy_buffering off for /api/live/events',
    corsHeaders: 'Check if CORS headers allow EventSource',
    cacheControl: 'Check if Cache-Control: no-cache is set for SSE endpoints',
    connectionKeepAlive: 'Check if Connection: keep-alive is maintained',
    note: 'Current nginx config serves static files only. API calls go directly to backend.'
  }
  
  console.log('[Proxy] Configuration notes:', checks)
  
  return checks
}

/**
 * Diagnostic 5: Check if events are being created
 * GET /api/live/events/recent?limit=20
 */
export async function checkRecentEvents(limit = 20) {
  console.log('=== Diagnostic 5: Recent Events Check ===')
  
  try {
    const url = `${API_BASE}/live/events/recent?limit=${limit}`
    console.log(`[Recent Events] Fetching: ${url}`)
    
    const response = await fetch(url)
    const data = await response.json()
    
    console.log('[Recent Events] ✅ Response received:', data)
    
    const events = data.events || data || []
    const eventTypes = {}
    events.forEach(event => {
      const type = event.type || event.event_type
      eventTypes[type] = (eventTypes[type] || 0) + 1
    })
    
    return {
      success: true,
      status: response.status,
      eventCount: events.length,
      events,
      eventTypes,
      latestEvent: events[0] || null,
      oldestEvent: events[events.length - 1] || null,
      error: null
    }
  } catch (error) {
    console.error('[Recent Events] ❌ Error:', error)
    return {
      success: false,
      error: error.message,
      events: [],
      eventCount: 0
    }
  }
}

/**
 * Run all diagnostics and return comprehensive report
 */
export async function runDiagnostics() {
  console.log('🔍 Starting Live Events Diagnostics...\n')
  
  const results = {
    timestamp: new Date().toISOString(),
    diagnostics: {}
  }
  
  // 1. SSE Connection
  console.log('\n')
  results.diagnostics.sseConnection = await checkSSEConnection()
  
  // 2. Live Status
  console.log('\n')
  results.diagnostics.liveStatus = await checkLiveStatus()
  
  // 3. Frontend Filters
  console.log('\n')
  results.diagnostics.frontendFilters = checkFrontendFilters()
  
  // 4. Proxy Config (manual check documentation)
  console.log('\n')
  results.diagnostics.proxyConfig = checkProxyConfig()
  
  // 5. Recent Events
  console.log('\n')
  results.diagnostics.recentEvents = await checkRecentEvents()
  
  // Summary
  console.log('\n=== DIAGNOSTIC SUMMARY ===')
  console.log('1. SSE Connection:', results.diagnostics.sseConnection.success ? '✅ SUCCESS' : '❌ FAILED')
  console.log('2. Live Status:', results.diagnostics.liveStatus.success ? '✅ SUCCESS' : '❌ FAILED')
  console.log('3. Recent Events:', results.diagnostics.recentEvents.success ? `✅ SUCCESS (${results.diagnostics.recentEvents.eventCount} events)` : '❌ FAILED')
  console.log('\nFull results:', results)
  
  return results
}

// Browser console helper - can be called directly
if (typeof window !== 'undefined') {
  window.runLiveDiagnostics = runDiagnostics
  window.checkSSEConnection = checkSSEConnection
  window.checkLiveStatus = checkLiveStatus
  window.checkRecentEvents = checkRecentEvents
  window.testSSEWithFilters = testSSEWithFilters
}




