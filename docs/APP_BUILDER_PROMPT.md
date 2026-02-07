# FootFive Frontend - App Builder Prompt

This document provides comprehensive information for rebuilding the FootFive frontend application using app builder LLMs like bolt.new or Gemini.

---

## Application Overview

**FootFive** is a real-time 5-a-side football tournament simulation frontend that displays live matches, tournament brackets, team statistics, and match history. The application connects to a backend API that runs continuous hourly tournaments and streams real-time events via Server-Sent Events (SSE).

### Key Features

- 🔴 **Live Tournament Dashboard** - Real-time tournament viewing with live score updates
- ⚡ **Server-Sent Events (SSE)** - Real-time event streaming for goals, match events, and tournament updates
- 📊 **Match History** - View all completed matches grouped by round
- 🏆 **Tournament Bracket** - Visual progression from Round of 16 → Quarter-finals → Semi-finals → Final
- 📜 **Event Feed** - Real-time event stream showing all goals and match events
- 🎯 **Team Stats** - Explore team ratings, records, and statistics
- 📈 **Odds Display** - View betting odds and win probabilities for matches
- ⚽ **Match Details** - Detailed match reports with statistics, events timeline, and player information

---

## Technology Stack

- **React 19** - UI library
- **Vite 7** - Build tool and dev server
- **Zustand 5** - State management (lightweight alternative to Redux)
- **React Router 7** - Client-side routing
- **Tailwind CSS 4** - Utility-first CSS framework
- **Axios** - HTTP client for API requests

### Development Setup

```bash
npm install
npm run dev    # Start dev server (typically http://localhost:5173)
npm run build  # Build for production
npm run preview # Preview production build
```

---

## Backend API Configuration

### Base URLs

**Production:**
```
https://jwd1.xyz/api
```

```

**Note:** All API endpoints are publicly accessible (no authentication required).

---

## Application Structure

### Routes

The application uses React Router with the following routes:

```
/                           → Home page
/live                       → Live Tournament Dashboard (main page)
/live/:fixtureId            → Individual live match detail page
/tournament                 → Alias redirect to /live
/fixtures                   → List of all fixtures (completed matches)
/fixtures/:id               → Individual fixture detail page
/teams                      → List of all teams
/teams/:id                  → Team detail page (by team name or ID)
/odds                       → List of upcoming matches with odds
```

### Page Components

- `Home.jsx` - Landing page
- `LiveDashboard.jsx` - Main live tournament view with bracket and active matches
- `LiveMatchDetail.jsx` - Detailed view of a single live match
- `FixtureList.jsx` - Historical fixtures list
- `FixtureDetail.jsx` - Completed match detail with report
- `TeamList.jsx` - All teams list
- `TeamDetail.jsx` - Individual team page with stats and players
- `OddsList.jsx` - Upcoming matches with betting odds

### Component Structure

```
src/
├── api/
│   └── client.js              # Axios client and API functions
├── components/
│   ├── common/                # Reusable UI components
│   │   ├── ErrorDisplay.jsx
│   │   ├── LoadingSpinner.jsx
│   │   ├── SkeletonCard.jsx
│   │   └── Toast.jsx          # Toast notification system
│   ├── fixtures/              # Fixture/match components
│   │   ├── EventTimeline.jsx
│   │   ├── FixtureCard.jsx
│   │   └── MatchReport.jsx
│   ├── layout/                # Layout components
│   │   ├── Footer.jsx
│   │   ├── Layout.jsx         # Main layout wrapper
│   │   └── Navbar.jsx         # Navigation bar
│   ├── live/                  # Live tournament components
│   │   ├── EventFeed.jsx      # Real-time event stream
│   │   ├── LiveMatchCard.jsx  # Live match card display
│   │   ├── LiveScore.jsx      # Score display component
│   │   ├── LiveScoreboard.jsx # Match scoreboard
│   │   ├── MatchClock.jsx     # Match time/minute display
│   │   ├── RoundSection.jsx   # Round grouping component
│   │   ├── TeamStatsPanel.jsx # Team statistics panel
│   │   ├── TournamentBracket.jsx # Tournament bracket visualization
│   │   └── WinnerCelebration.jsx # Winner celebration modal
│   ├── odds/                  # Odds display components
│   │   ├── OddsCard.jsx
│   │   └── ProbabilityBar.jsx
│   └── teams/                 # Team-related components
│       ├── FormIndicator.jsx  # Recent form display
│       ├── PlayerList.jsx     # Player roster
│       └── TeamCard.jsx       # Team card component
├── hooks/
│   └── useLiveEvents.js       # SSE connection hook
├── pages/                     # Page components (see above)
├── stores/                    # Zustand state stores
│   ├── useLiveStore.js        # Live tournament state
│   ├── useMatchStore.js       # Match/fixture state
│   └── useTournamentStore.js  # Tournament state
└── utils/
    └── formatters.js          # Utility functions for formatting
```

---

## API Endpoints Reference

### Base Configuration

All API calls should use the base URL: `https://jwd1.xyz/api` (or `http://localhost:9001/api` for local development)

### Live Tournament API (`/live/*`)

**Note:** The live tournament runs continuously on an hourly schedule:
- **:55** - Tournament setup (teams shuffled)
- **:00** - Round of 16 (8 matches, ~9 minutes each)
- **:15** - Quarter-finals (4 matches)
- **:30** - Semi-finals (2 matches)
- **:45** - Final (1 match)

#### `GET /live/status`
Full system status including simulation and tournament info.

**Response:**
```json
{
  "simulation": {
    "isRunning": true,
    "isPaused": false,
    "tickCount": 1234,
    "speedMultiplier": 1,
    "activeMatches": 8
  },
  "eventBus": {
    "eventsEmitted": 456,
    "eventsPersisted": 456,
    "clientsConnected": 2,
    "bufferSize": 456,
    "currentSequence": 456
  },
  "tournament": {
    "state": "ROUND_OF_16",
    "tournamentId": 123456789,
    "currentRound": "Round of 16",
    "teamsRemaining": 16,
    "activeMatches": 8,
    "winner": null,
    "runnerUp": null
  }
}
```

**Tournament States:**
- `IDLE` - No tournament running
- `SETUP` - Preparing next tournament
- `ROUND_OF_16` - R16 matches in progress
- `QF_BREAK` - Break before quarter-finals
- `QUARTER_FINALS` - QF matches in progress
- `SF_BREAK` - Break before semi-finals
- `SEMI_FINALS` - SF matches in progress
- `FINAL_BREAK` - Break before final
- `FINAL` - Final match in progress
- `RESULTS` - Tournament complete, showing results
- `COMPLETE` - Tournament finished

#### `GET /live/tournament`
Current tournament state snapshot (lighter than `/status`).

#### `GET /live/matches`
All currently active matches.

**Response:**
```json
{
  "matches": [
    {
      "fixtureId": 123,
      "state": "FIRST_HALF",
      "minute": 23,
      "score": { "home": 1, "away": 0 },
      "penaltyScore": { "home": 0, "away": 0 },
      "homeTeam": { "id": 1, "name": "Metro City", "attackRating": 87, "defenseRating": 83, "goalkeeperRating": 75 },
      "awayTeam": { "id": 2, "name": "Port Hilo", "attackRating": 85, "defenseRating": 80, "goalkeeperRating": 78 },
      "round": "Round of 16",
      "isFinished": false
    }
  ],
  "count": 8
}
```

**Match States:**
- `SCHEDULED` - Not started
- `FIRST_HALF` - First half (0-45 min)
- `HALFTIME` - Halftime break
- `SECOND_HALF` - Second half (45-90 min)
- `EXTRA_TIME_1` - Extra time first half
- `ET_HALFTIME` - Extra time break
- `EXTRA_TIME_2` - Extra time second half
- `PENALTIES` - Penalty shootout
- `FINISHED` - Match complete

#### `GET /live/fixtures`
All fixtures for current tournament (completed + active + upcoming).

**Response:**
```json
{
  "fixtures": [
    {
      "fixtureId": 123,
      "state": "FINISHED",
      "score": { "home": 2, "away": 1 },
      "penaltyScore": { "home": 0, "away": 0 },
      "homeTeam": { "id": 1, "name": "Metro City" },
      "awayTeam": { "id": 2, "name": "Port Hilo" },
      "round": "Round of 16",
      "isFinished": true,
      "bracketSlot": "R16_1",
      "feedsInto": "QF1"
    }
  ]
}
```

#### `GET /live/matches/:fixtureId`
Single match detail with stats.

**Response:**
```json
{
  "fixtureId": 123,
  "state": "SECOND_HALF",
  "minute": 67,
  "score": { "home": 2, "away": 1 },
  "penaltyScore": { "home": 0, "away": 0 },
  "homeTeam": { "id": 1, "name": "Metro City" },
  "awayTeam": { "id": 2, "name": "Port Hilo" },
  "isFinished": false,
  "tickElapsed": 402,
  "stats": {
    "home": { "shots": 8, "shotsOnTarget": 4, "corners": 3, "fouls": 5, "xg": 1.45 },
    "away": { "shots": 5, "shotsOnTarget": 2, "corners": 1, "fouls": 7, "xg": 0.82 }
  }
}
```

#### `GET /live/events/recent`
Recent events from memory buffer (last 1000 events).

**Query Parameters:**
- `fixtureId` (int) - Filter by match
- `tournamentId` (int) - Filter by tournament
- `type` (string) - Filter by event type (e.g., `goal`)
- `afterSeq` (int) - Only events after this sequence number
- `limit` (int) - Max events to return (default: 100)

**Response:**
```json
{
  "events": [
    {
      "seq": 456,
      "type": "goal",
      "fixtureId": 123,
      "minute": 23,
      "timestamp": 1703789012345,
      "score": { "home": 1, "away": 0 },
      "homeTeam": { "id": 1, "name": "Metro City" },
      "awayTeam": { "id": 2, "name": "Port Hilo" },
      "teamId": 1,
      "playerId": 45,
      "displayName": "J. Smith",
      "assistPlayerId": 32,
      "assistName": "M. Jones"
    }
  ],
  "count": 1
}
```

#### `GET /live/events` (SSE Stream)
Server-Sent Events stream for real-time updates.

**Query Parameters:**
- `fixtureId` (int) - Only events for this match
- `tournamentId` (int) - Only events for this tournament
- `afterSeq` (int) - Catchup: send missed events after this sequence

**JavaScript Implementation:**
```javascript
const eventSource = new EventSource('https://jwd1.xyz/api/live/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle event (goal, match_start, match_end, etc.)
  console.log('Event:', data.type, data);
};

eventSource.onerror = (err) => {
  console.error('SSE error:', err);
  // Implement reconnection logic with afterSeq for catchup
  eventSource.close();
};
```

**Event Types:**
- `match_start` - Match kicked off
- `goal` - Goal scored
- `halftime` - Half-time reached
- `second_half_start` - Second half begins
- `fulltime` - 90 mins complete
- `penalty_scored` - Penalty converted
- `penalty_missed` - Penalty missed
- `penalty_saved` - Penalty saved
- `extra_time_start` - Extra time begins
- `shootout_start` - Shootout begins
- `shootout_goal` - Shootout goal
- `shootout_miss` - Shootout miss
- `shootout_save` - Shootout save
- `match_end` - Match finished
- `round_start` - Tournament round begins
- `round_complete` - Round finished
- `tournament_end` - Tournament complete

### Teams API (`/teams`)

#### `GET /teams`
Get all teams with statistics.

**Response:**
```json
{
  "teams": [
    {
      "id": 1,
      "name": "Metro City",
      "attackRating": 87,
      "defenseRating": 83,
      "goalkeeperRating": 75,
      "wins": 45,
      "losses": 12,
      "goalsFor": 234,
      "goalsAgainst": 156,
      "jcups_won": 2,
      "runner_ups": 1,
      "recentForm": "WWLDW"
    }
  ]
}
```

**Note:** The API returns teams in camelCase format. Transform to snake_case if needed:
- `attackRating` → `attack_rating`
- `defenseRating` → `defense_rating`
- `goalkeeperRating` → `gk_rating`
- `goalsFor` → `goals_for`
- `goalsAgainst` → `goals_against`
- `jcups_won` → `cups_won`

### Fixtures API (`/fixtures`)

#### `GET /fixtures`
Get all fixtures (historical matches).

**Query Parameters:**
- `status` (string) - Filter by status (`completed`, `scheduled`, etc.)
- `teamId` (int) - Filter by team ID
- `tournamentId` (int) - Filter by tournament
- `round` (string) - Filter by round name
- `limit` (int) - Limit number of results

**Response:**
```json
{
  "fixtures": [
    {
      "fixtureId": 123,
      "homeTeam": { "id": 1, "name": "Metro City" },
      "awayTeam": { "id": 2, "name": "Port Hilo" },
      "score": { "home": 2, "away": 1 },
      "status": "completed",
      "state": "FINISHED",
      "scheduledAt": "2024-01-15T10:00:00Z",
      "completedAt": "2024-01-15T10:45:00Z",
      "round": "Round of 16"
    }
  ]
}
```

#### `GET /fixtures/:id`
Get single fixture detail.

#### `GET /fixtures/:id/events`
Get all events for a completed match.

**Query Parameters:**
- `afterEventId` (int) - Get events after this ID (for polling)
- `type` (string) - Filter by event type (e.g., `goal`)

#### `GET /fixtures/:id/goals`
Get only goal events for a match.

#### `GET /fixtures/:id/report`
Get match statistics report.

**Response:**
```json
{
  "fixture": { ... },
  "report": {
    "stats": {
      "home": {
        "possession": 52,
        "shots": 12,
        "shotsOnTarget": 8,
        "corners": 5,
        "fouls": 7,
        "yellowCards": 2,
        "redCards": 0,
        "xg": 2.45
      },
      "away": {
        "possession": 48,
        "shots": 8,
        "shotsOnTarget": 5,
        "corners": 3,
        "fouls": 9,
        "yellowCards": 1,
        "redCards": 0,
        "xg": 1.82
      }
    }
  }
}
```

#### `GET /fixtures/:id/odds`
Get betting odds for a fixture.

**Response:**
```json
{
  "odds": {
    "homeWin": 1.71,
    "awayWin": 2.15,
    "draw": 3.20,
    "homeProb": 0.5564,
    "awayProb": 0.4436,
    "drawProb": 0.3125
  }
}
```

#### `POST /fixtures`
Create a new fixture.

**Request Body:**
```json
{
  "homeTeamId": 1,
  "awayTeamId": 2,
  "round": "Friendly"
}
```

#### `POST /fixtures/:id/simulate`
Simulate a fixture (run the match).

### Players API (`/players`)

#### `GET /players/team/:teamName`
Get all players for a specific team.

**Response:**
```json
{
  "players": [
    {
      "id": 45,
      "name": "J. Smith",
      "position": "Forward",
      "rating": 85,
      "goals": 12,
      "assists": 8
    }
  ]
}
```

### J-Cup Tournament API (`/jcup`)

**Note:** This is for manual tournament management. The live tournament system runs automatically.

#### `GET /jcup/init`
Initialize a new 16-team knockout tournament.

#### `GET /jcup/play`
Play the next round (simulates all matches in current round).

#### `POST /jcup/end`
End tournament and record winner/runner-up.

**Request Body:**
```json
{
  "winner_id": 1,
  "runner_id": 2
}
```

---

## State Management

The application uses **Zustand** for state management. Key stores:

### `useLiveStore`
Manages live tournament state, matches, events, and connection status.

**State:**
- `connected` - SSE connection status
- `tournament` - Current tournament state
- `fixtures` - All fixtures (completed + active + upcoming)
- `matches` - Currently active matches
- `completedMatches` - Finished matches
- `upcomingFixtures` - Next round fixtures
- `recentEvents` - Recent events buffer
- `simulation` - Simulation state

**Key Actions:**
- `fetchSnapshot()` - Fetch full status + fixtures
- `handleEvent(event)` - Handle incoming SSE event
- `updateMatch(fixtureId, updates)` - Update single match
- `getMatchesByRound()` - Get matches grouped by round
- `getLiveMatches()` - Get currently live matches

---

## Real-Time Features (SSE)

The application connects to Server-Sent Events (SSE) stream for real-time updates.

### Connection Pattern

1. **Initial Load:** Fetch snapshot using `GET /live/status` and `GET /live/fixtures`
2. **SSE Connection:** Connect to `GET /live/events` stream
3. **Reconnection:** On disconnect, reconnect with `afterSeq` parameter to catch up on missed events
4. **Event Handling:** Process events and update UI state accordingly

### Example Hook Implementation

```javascript
import { useState, useEffect, useRef } from 'react';

function useLiveEvents({ tournamentId, fixtureId, onEvent, enabled = true }) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef(null);
  const lastSeqRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const params = {};
    if (tournamentId) params.tournamentId = tournamentId;
    if (fixtureId) params.fixtureId = fixtureId;
    if (lastSeqRef.current > 0) params.afterSeq = lastSeqRef.current;

    const url = new URL('https://jwd1.xyz/api/live/events');
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => setConnected(true);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.seq) lastSeqRef.current = data.seq;
      if (onEvent) onEvent(data);
    };

    eventSource.onerror = () => {
      eventSource.close();
      // Reconnect logic with exponential backoff
      setTimeout(() => {
        if (enabled) connect();
      }, 3000);
    };

    return () => {
      eventSource.close();
    };
  }, [enabled, tournamentId, fixtureId, onEvent]);

  return { connected };
}
```

---

## Styling & Design System

The application uses **Tailwind CSS 4** with a custom dark theme.

### Color Palette

```css
Primary: #00e5a0 (Electric green/teal)
Primary Dark: #00c288
Primary Light: #4dffc3
Accent: #ff6b35 (Orange)
Gold: #ffd700

Background: #0a0e17 (Deep navy)
Background Elevated: #111827
Card: #151d2e
Card Hover: #1c2842

Text: #f0f4f8 (Light gray/white)
Text Muted: #7c8ba1

Border: #2a3650

Win: #00e5a0 (Green)
Draw: #ffd700 (Gold)
Loss: #ff4d6a (Red)
Live: #ff4d6a (Red/pink)
```

### Typography

- **Display Font:** "Bebas Neue" or "Oswald" (for headings)
- **Body Font:** "Space Grotesk" or "DM Sans" (system fallback)
- **Mono Font:** "JetBrains Mono" or "Fira Code" (for stats/numbers)

### Design Principles

- **Dark theme** with high contrast
- **Modern, sport-focused** aesthetic
- **Responsive design** (mobile-first)
- **Real-time indicators** (pulsing animations for live matches)
- **Card-based layout** with hover effects
- **Clean typography** with good hierarchy

---

## Key UI Components & Patterns

### Live Match Card
Displays:
- Team names and logos/initials
- Current score
- Match state (1st Half, 2nd Half, etc.)
- Match minute
- Live indicator (pulsing red dot)
- Click to view details

### Tournament Bracket
Visual bracket showing:
- Round of 16 (8 matches)
- Quarter-finals (4 matches)
- Semi-finals (2 matches)
- Final (1 match)
- Winner progression
- Completed matches (with scores)
- Active matches (highlighted)
- Upcoming matches (grayed out)

### Event Feed
Real-time stream of events:
- Goals (highlighted)
- Match state changes
- Key events (cards, penalties)
- Formatted as timeline with timestamps

### Match Report
Detailed statistics:
- Possession percentage
- Shots (total and on target)
- Expected Goals (xG)
- Corners
- Fouls
- Cards (yellow/red)
- Event timeline

### Team Card
Shows:
- Team name
- Ratings (Attack, Defense, Goalkeeper)
- Record (Wins, Losses)
- Goals For/Against
- Recent form (last 5 matches: W/L/D)
- Cups won
- Click to view detail page

---

## Development Guidelines

### API Client Setup

Use Axios with interceptors for logging and error handling:

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://jwd1.xyz/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[API Error]', error.response?.data || error.message);
    return Promise.reject(error);
  }
);
```

### Data Transformation

The backend API returns data in camelCase format, but the frontend may use snake_case. Implement transformation functions as needed.

**Team transformation example:**
```javascript
const transformTeam = (team) => ({
  team_id: team.id,
  team_name: team.name,
  attack_rating: team.attackRating,
  defense_rating: team.defenseRating,
  gk_rating: team.goalkeeperRating,
  wins: team.wins,
  losses: team.losses,
  goals_for: team.goalsFor,
  goals_against: team.goalsAgainst,
  cups_won: team.jcups_won,
  runner_ups: team.runner_ups,
  recent_form: team.recentForm,
});
```

### Error Handling

- Display user-friendly error messages
- Show loading states during API calls
- Handle network errors gracefully
- Implement retry logic for failed requests
- Display connection status for SSE streams

### Performance Considerations

- Use React.memo for expensive components
- Implement virtual scrolling for long lists
- Lazy load routes if needed
- Optimize images/assets
- Minimize re-renders with proper state management

---

## Testing & Deployment

### Environment Variables

Create `.env` files if needed:
```
VITE_API_BASE_URL=https://jwd1.xyz/api
```

### Build Output

Production build outputs to `dist/` directory. Serve with any static file server or configure nginx for production deployment.

---

## Additional Notes

1. **Round Normalization:** The backend may return rounds in various formats (e.g., "Quarter-finals", "Quarterfinals", "QF"). Implement normalization logic to handle variations.

2. **Bracket Resolution:** Some fixtures may have `null` teams initially. Use the `feedsInto` and `bracketSlot` fields to resolve teams from previous round winners.

3. **Event Sequencing:** SSE events include a `seq` field for ordering. Use this for reconnection catchup and ensuring events are processed in order.

4. **Tournament Timing:** The live tournament runs on a fixed schedule. Display countdown timers or "Next tournament at :55" messages when idle.

5. **Match Duration:** Each match lasts approximately 9 minutes (4 min halves + 1 min halftime). Extra time and penalties add additional time.

---

## Example Implementation Snippets

### Fetching Live Tournament Status

```javascript
const fetchLiveStatus = async () => {
  try {
    const [statusRes, fixturesRes] = await Promise.all([
      axios.get('https://jwd1.xyz/api/live/status'),
      axios.get('https://jwd1.xyz/api/live/fixtures'),
    ]);
    
    const tournament = statusRes.data.tournament;
    const fixtures = fixturesRes.data.fixtures;
    
    // Update state with tournament and fixtures
    return { tournament, fixtures };
  } catch (error) {
    console.error('Failed to fetch live status:', error);
    throw error;
  }
};
```

### Connecting to SSE Stream

```javascript
useEffect(() => {
  const eventSource = new EventSource('https://jwd1.xyz/api/live/events');
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case 'goal':
        // Update score, show notification
        break;
      case 'match_start':
        // Add match to UI
        break;
      case 'match_end':
        // Finalize match
        break;
      case 'round_complete':
        // Update tournament state
        break;
    }
  };
  
  eventSource.onerror = () => {
    eventSource.close();
    // Reconnect logic
  };
  
  return () => eventSource.close();
}, []);
```

### Rendering Tournament Bracket

```javascript
const rounds = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];
const fixtures = useLiveStore(state => state.fixtures);

{rounds.map(round => {
  const roundFixtures = fixtures.filter(f => f.round === round);
  return (
    <RoundSection
      key={round}
      round={round}
      fixtures={roundFixtures}
      onMatchClick={(fixtureId) => navigate(`/live/${fixtureId}`)}
    />
  );
})}
```

---

This prompt contains all the essential information needed to rebuild the FootFive frontend application. Use this as input for app builders like bolt.new or Gemini, and they should be able to generate a functional implementation of the application.

