# Backend Bug Report: Semi-Finals Matches Not Starting Simultaneously

## Problem Summary
During knockout tournament rounds (particularly Semi-Finals), only ONE match starts and plays through while the other match(es) in the same round remain in `SCHEDULED` state. All matches in a knockout round should start and play simultaneously.

## Evidence from Live API

When querying `/api/live/fixtures` during the Semi-Finals round, the API returns:

```json
{
  "fixture 441": {
    "state": "HALFTIME",
    "minute": 45,
    "teams": "Mega City Two vs Mega City One"
  },
  "fixture 442": {
    "state": "SCHEDULED",
    "minute": 0,
    "teams": "Green Bay vs Port Hilo"
  }
}
```

**Problem**: Fixture 441 is at halftime (45 minutes played) while fixture 442 hasn't even started - it's still `SCHEDULED` with `minute: 0`.

## Expected Behavior
When a round starts (e.g., Semi-Finals at :30):
1. ALL matches in that round should transition from `SCHEDULED` to `FIRST_HALF` simultaneously
2. ALL matches should receive `match_start` SSE events at the same time
3. ALL matches should progress through the game (minute ticks, goals, halftime, etc.) in parallel
4. The round should only complete when ALL matches have finished

## Current (Buggy) Behavior
1. Only ONE match per round starts playing
2. Other matches stay in `SCHEDULED` state indefinitely
3. The second semi-final never starts while the first one plays out
4. This causes the frontend to correctly show "Upcoming" for matches that the backend hasn't started

## Investigation Areas

### 1. Match Initialization Logic
Look for code that starts matches when a round begins. Check if:
- There's a loop that should iterate over ALL matches in the round
- The loop might be breaking early or only processing the first match
- There might be an `await` inside a loop causing sequential instead of parallel execution

### 2. Round State Machine
Check the tournament state transitions:
- `SETUP` → `ROUND_OF_16` → `QF_BREAK` → `QUARTER_FINALS` → `SF_BREAK` → `SEMI_FINALS` → `FINAL_BREAK` → `FINAL` → `RESULTS`

When transitioning to a playing state (e.g., `SEMI_FINALS`), ensure ALL fixtures for that round are started.

### 3. Match Simulation Loop
If using a game loop or interval to simulate matches:
- Check if it's only updating ONE match per tick
- Should be updating ALL active matches per tick
- Might need `Promise.all()` for parallel processing

### 4. SSE Event Broadcasting
Verify that `match_start` events are being sent for ALL matches in a round, not just the first one.

## Likely Code Patterns to Fix

### Pattern 1: Sequential await in loop (BAD)
```javascript
// BAD - processes matches one at a time
for (const match of roundMatches) {
  await startMatch(match);  // This waits for each match to complete!
}
```

### Fix: Parallel processing
```javascript
// GOOD - starts all matches simultaneously
await Promise.all(roundMatches.map(match => startMatch(match)));
```

### Pattern 2: Only starting first match
```javascript
// BAD - only starts the first match
const match = roundMatches[0];
await startMatch(match);
```

### Fix: Start all matches
```javascript
// GOOD - starts all matches
for (const match of roundMatches) {
  startMatch(match);  // No await, or use Promise.all
}
```

### Pattern 3: Game loop only processing one match
```javascript
// BAD - only updates first active match
const activeMatch = getActiveMatch();
simulateTick(activeMatch);
```

### Fix: Process all active matches
```javascript
// GOOD - updates all active matches
const activeMatches = getActiveMatches();
activeMatches.forEach(match => simulateTick(match));
```

## Files to Investigate
Look for files/functions related to:
- Tournament state management
- Round initialization/starting
- Match simulation loop
- Match state transitions
- SSE event broadcasting

Common file names might include:
- `tournament.js`, `tournament-controller.js`
- `match.js`, `match-simulation.js`
- `round.js`, `round-manager.js`
- `game-loop.js`, `simulation.js`

## Verification Steps After Fix
1. Start a new tournament
2. When Semi-Finals begin, verify BOTH matches show `state: "FIRST_HALF"`
3. Both matches should have incrementing `minute` values
4. Both matches should receive goals, events, etc. in parallel
5. Verify SSE stream sends events for BOTH matches

## Additional Notes
- The frontend is correctly displaying what the backend sends
- This is NOT a frontend bug - the frontend shows "Upcoming" because the backend literally says `state: "SCHEDULED"`
- The fix needs to ensure all matches in a round start and run in parallel

