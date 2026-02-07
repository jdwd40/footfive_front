# SSE Live Events Diagnostic Report

This document answers the 5 diagnostic questions for troubleshooting the live events SSE connection.

## Question 1: Is the frontend connecting to /api/live/events successfully?

### Code Analysis
- **Location**: `src/hooks/useLiveEvents.js`
- **Endpoint**: `https://jwd1.xyz/api/live/events`
- **Connection Method**: `EventSource` (native browser SSE API)
- **Usage**: 
  - `LiveDashboard.jsx` connects with `tournamentId` filter
  - `LiveMatchDetail.jsx` connects with `fixtureId` filter

### How to Test
1. **Browser Console Test**:
   ```javascript
   // In browser console on https://jwd1.xyz
   const es = new EventSource('https://jwd1.xyz/api/live/events')
   es.onopen = () => console.log('✅ Connected!')
   es.onmessage = (e) => console.log('Event:', e.data)
   es.onerror = (e) => console.error('❌ Error:', e)
   ```

2. **Network Tab Check**:
   - Open DevTools → Network tab
   - Filter by "EventSource" or "events"
   - Look for `/api/live/events` request
   - Status should be 200 with type "eventsource"
   - Should see "connected" event data immediately

3. **Using Diagnostic Script**:
   ```javascript
   // In browser console
   import { checkSSEConnection } from './src/utils/diagnostics'
   checkSSEConnection()
   ```

### Expected Behavior
- Connection should open immediately (< 1 second)
- Should receive initial connection confirmation (if backend sends one)
- Connection stays open (not a one-time request)

### Potential Issues
- ❌ **CORS errors**: Backend must allow EventSource from frontend origin
- ❌ **Network errors**: Check if backend is accessible
- ❌ **Timeout**: Backend might not be responding
- ❌ **Connection closes immediately**: Backend might be rejecting the connection

---

## Question 2: Are matches actually running? Check GET /api/live/status

### Code Analysis
- **Location**: `src/api/client.js` → `liveApi.getStatus()`
- **Endpoint**: `GET https://jwd1.xyz/api/live/status`
- **Usage**: `src/stores/useLiveStore.js` → `fetchSnapshot()`

### How to Test
1. **Direct API Call**:
   ```bash
   curl https://jwd1.xyz/api/live/status
   ```

2. **Browser Console**:
   ```javascript
   fetch('https://jwd1.xyz/api/live/status')
     .then(r => r.json())
     .then(data => {
       console.log('Tournament state:', data.tournament?.state)
       console.log('Active matches:', data.tournament?.state && 
         ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'].includes(data.tournament.state))
     })
   ```

3. **Using Diagnostic Script**:
   ```javascript
   import { checkLiveStatus } from './src/utils/diagnostics'
   checkLiveStatus()
   ```

### Expected Response Structure
```json
{
  "tournament": {
    "tournamentId": 123,
    "state": "SEMI_FINALS",  // Should be one of: ROUND_OF_16, QUARTER_FINALS, SEMI_FINALS, FINAL
    "currentRound": "Semi-finals"
  },
  "simulation": {
    "running": true
  }
}
```

### Key Checks
- ✅ `tournament.state` should be in playing states: `ROUND_OF_16`, `QUARTER_FINALS`, `SEMI_FINALS`, or `FINAL`
- ✅ If state is `IDLE`, `SETUP`, or break states (`QF_BREAK`, `SF_BREAK`), no matches are running
- ❌ If state is `SCHEDULED` for matches but state is in a playing state, this indicates the backend bug (matches not starting)

---

## Question 3: Does frontend pass correct tournamentId or fixtureId filter?

### Code Analysis

#### LiveDashboard (Tournament-level)
- **File**: `src/pages/LiveDashboard.jsx`
- **Lines**: 127-131
- **Filter Used**: `tournamentId: tournament?.tournamentId`
- **URL Generated**: `https://jwd1.xyz/api/live/events?tournamentId=123`

#### LiveMatchDetail (Fixture-level)
- **File**: `src/pages/LiveMatchDetail.jsx`
- **Lines**: 84-88
- **Filter Used**: `fixtureId: parseInt(fixtureId)`
- **URL Generated**: `https://jwd1.xyz/api/live/events?fixtureId=456`

#### URL Generation
- **File**: `src/api/client.js`
- **Function**: `liveApi.getEventsStreamUrl(params)`
- **Lines**: 264-274

### How to Test
1. **Check Network Tab**:
   - Open DevTools → Network → Filter by "events"
   - Inspect the EventSource request URL
   - Verify query parameters are present and correct

2. **Browser Console**:
   ```javascript
   // Check what URL is being used
   const baseUrl = 'https://jwd1.xyz/api'
   const params = new URLSearchParams()
   params.set('tournamentId', '123')  // or fixtureId
   console.log(`${baseUrl}/live/events?${params.toString()}`)
   ```

3. **Using Diagnostic Script**:
   ```javascript
   import { testSSEWithFilters } from './src/utils/diagnostics'
   
   // Test with tournamentId
   testSSEWithFilters(123, null)
   
   // Test with fixtureId
   testSSEWithFilters(null, 456)
   
   // Test without filters
   testSSEWithFilters(null, null)
   ```

### Potential Issues
- ❌ **tournamentId is null/undefined**: Tournament might not be loaded yet
- ❌ **fixtureId is NaN**: URL parameter might not be a valid number
- ❌ **Filter not applied**: URL might not include query parameters
- ❌ **Backend doesn't support filters**: Backend might ignore the filters

### Code Location References
```javascript
// LiveDashboard.jsx - Line 128
tournamentId: tournament?.tournamentId

// LiveMatchDetail.jsx - Line 85
fixtureId: parseInt(fixtureId)

// useLiveEvents.js - Lines 40-43
const params = {}
if (tournamentId) params.tournamentId = tournamentId
if (fixtureId) params.fixtureId = fixtureId
```

---

## Question 4: Any nginx/proxy in front that might buffer SSE?

### Configuration Analysis
- **File**: `deploy/nginx-jwd1.xyz.conf`
- **Current Setup**: 
  - Nginx serves static files only (React app)
  - API calls go directly to backend at `https://jwd1.xyz/api`
  - No proxy configuration visible in frontend repo

### Key SSE Requirements
For Server-Sent Events to work properly through a proxy/nginx:

1. **proxy_buffering must be OFF**:
   ```nginx
   location /api/live/events {
       proxy_buffering off;
       proxy_cache off;
   }
   ```

2. **Cache-Control headers**:
   ```nginx
   proxy_set_header Cache-Control "no-cache";
   proxy_set_header Connection "";
   ```

3. **Keep-Alive connections**:
   ```nginx
   proxy_http_version 1.1;
   proxy_set_header Connection "";
   ```

4. **CORS headers** (if needed):
   ```nginx
   add_header Access-Control-Allow-Origin "*";
   add_header Access-Control-Allow-Methods "GET, OPTIONS";
   ```

### How to Check
1. **Check nginx config on server**:
   ```bash
   # SSH into server
   sudo cat /etc/nginx/sites-available/jwd1.xyz
   # or
   sudo cat /etc/nginx/nginx.conf
   ```

2. **Check response headers**:
   ```bash
   curl -I https://jwd1.xyz/api/live/events
   ```
   
   Look for:
   - `Cache-Control: no-cache` (or similar)
   - `Content-Type: text/event-stream`
   - No `X-Accel-Buffering: yes` (should be absent or set to "no")

3. **Test direct backend access** (if backend has different URL):
   - Try connecting to backend directly (if you know the IP/port)
   - Compare behavior with/without nginx

### Current Status
- ✅ Frontend nginx config doesn't proxy API requests
- ❓ Backend might have its own nginx/proxy configuration
- ❓ Need to check backend server configuration

### Recommendation
If backend is behind nginx, ensure the backend nginx config has:
```nginx
location /api/live/events {
    proxy_pass http://backend:port;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Cache-Control "no-cache";
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_read_timeout 24h;  # Keep connection open
}
```

---

## Question 5: Are events being created? Check GET /api/live/events/recent?limit=20

### Code Analysis
- **Location**: `src/api/client.js` → `liveApi.getRecentEvents()`
- **Endpoint**: `GET https://jwd1.xyz/api/live/events/recent?limit=20`
- **Usage**: `src/pages/LiveMatchDetail.jsx` → Line 101-104

### How to Test
1. **Direct API Call**:
   ```bash
   curl "https://jwd1.xyz/api/live/events/recent?limit=20"
   ```

2. **Browser Console**:
   ```javascript
   fetch('https://jwd1.xyz/api/live/events/recent?limit=20')
     .then(r => r.json())
     .then(data => {
       console.log('Event count:', data.events?.length || 0)
       console.log('Latest events:', data.events?.slice(0, 5))
       console.log('Event types:', [...new Set(data.events?.map(e => e.type))])
     })
   ```

3. **Using Diagnostic Script**:
   ```javascript
   import { checkRecentEvents } from './src/utils/diagnostics'
   checkRecentEvents(20)
   ```

### Expected Response Structure
```json
{
  "events": [
    {
      "type": "goal",
      "fixtureId": 123,
      "minute": 45,
      "seq": 1001,
      "score": { "home": 1, "away": 0 },
      "displayName": "Player Name",
      "teamId": 5
    },
    // ... more events
  ]
}
```

### Key Checks
- ✅ **Event count > 0**: Events are being created
- ✅ **Recent timestamps**: Events should be recent (within last few minutes if matches are running)
- ✅ **Variety of event types**: Should see `match_start`, `goal`, `halftime`, etc.
- ✅ **fixtureId present**: Events should have fixtureId to identify which match
- ✅ **Sequence numbers**: Events should have `seq` field for ordering

### If No Events Returned
- ❌ Backend might not be creating events
- ❌ Events might be cleared/expired too quickly
- ❌ Backend endpoint might not be working
- ❌ Matches might not be running (see Question 2)

---

## Running All Diagnostics

### Option 1: Browser Console
```javascript
// Copy/paste this into browser console on https://jwd1.xyz
import { runDiagnostics } from './src/utils/diagnostics'
runDiagnostics().then(results => {
  console.log('Full diagnostic results:', results)
})
```

### Option 2: Manual Checklist
1. ✅ Open DevTools → Network tab
2. ✅ Filter by "events" or "EventSource"
3. ✅ Navigate to Live Dashboard page
4. ✅ Check if `/api/live/events` request appears
5. ✅ Check request status (should be 200)
6. ✅ Check response type (should be "eventsource")
7. ✅ Check if events appear in the EventStream
8. ✅ Check query parameters (tournamentId/fixtureId)
9. ✅ Check `/api/live/status` response
10. ✅ Check `/api/live/events/recent?limit=20` response

### Option 3: Terminal/curl Tests
```bash
# 1. Check status
curl https://jwd1.xyz/api/live/status | jq

# 2. Check recent events
curl "https://jwd1.xyz/api/live/events/recent?limit=20" | jq

# 3. Test SSE connection (will hang, Ctrl+C to stop)
curl -N https://jwd1.xyz/api/live/events
```

---

## Quick Reference: Code Locations

| Question | File | Lines | Key Function/Component |
|----------|------|-------|------------------------|
| 1. SSE Connection | `src/hooks/useLiveEvents.js` | 28-111 | `connect()` |
| 1. SSE Connection | `src/pages/LiveDashboard.jsx` | 123-131 | `useLiveEvents()` |
| 2. Live Status | `src/api/client.js` | 228-231 | `liveApi.getStatus()` |
| 2. Live Status | `src/stores/useLiveStore.js` | 196-341 | `fetchSnapshot()` |
| 3. Filters | `src/pages/LiveDashboard.jsx` | 128 | `tournamentId` |
| 3. Filters | `src/pages/LiveMatchDetail.jsx` | 85 | `fixtureId` |
| 3. Filters | `src/api/client.js` | 264-274 | `getEventsStreamUrl()` |
| 4. Proxy Config | `deploy/nginx-jwd1.xyz.conf` | All | Nginx config |
| 5. Recent Events | `src/api/client.js` | 258-261 | `liveApi.getRecentEvents()` |
| 5. Recent Events | `src/pages/LiveMatchDetail.jsx` | 101-104 | Usage example |

---

## Next Steps Based on Results

### If SSE Connection Fails (Question 1)
1. Check backend is running and accessible
2. Check CORS configuration on backend
3. Check browser console for specific error messages
4. Test direct backend URL (if different from frontend domain)

### If Matches Not Running (Question 2)
1. This indicates the backend bug described in BACKEND_BUG_REPORT.md
2. Backend needs to start ALL matches in a round simultaneously
3. Frontend is correctly showing "SCHEDULED" state from backend

### If Filters Not Working (Question 3)
1. Verify tournamentId/fixtureId values in React DevTools
2. Check Network tab for actual URL being requested
3. Test with/without filters to see if backend responds differently
4. Check backend logs for filter parameter parsing

### If Proxy Buffering (Question 4)
1. Check backend nginx/proxy configuration
2. Add `proxy_buffering off` to SSE endpoint location
3. Ensure `Cache-Control: no-cache` headers
4. Test direct backend access (bypass proxy)

### If No Events Created (Question 5)
1. Verify matches are actually running (Question 2)
2. Check backend event creation logic
3. Check backend event buffer/storage
4. Verify backend endpoint `/api/live/events/recent` is working


