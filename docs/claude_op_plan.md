# FootFive Frontend Plan

## Tech Stack
- **Framework:** Vite + React 18
- **Styling:** TailwindCSS
- **State:** Zustand (lightweight)
- **Routing:** React Router v6
- **HTTP:** Axios
- **API Base:** `https://jwd1.xyz/api`

---

## Pages & Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | Home | Dashboard w/ live matches, upcoming fixtures |
| `/fixtures` | FixtureList | All fixtures (filter by status) |
| `/fixtures/:id` | FixtureDetail | Match details, report, events |
| `/fixtures/:id/live` | LiveMatch | Real-time match viewer |
| `/teams` | TeamList | All 16 teams w/ stats |
| `/teams/:id` | TeamDetail | Team profile, players, recent form |
| `/odds` | OddsList | All upcoming fixtures w/ betting odds |

---

## Core Features

### 1. Fixtures & Results
- **List view:** scheduled/live/completed tabs
- **Cards:** home vs away, score, date, status badge
- **Filters:** by team, round, tournament
- **Click → detail page** w/ match report (possession, shots, xG, cards)

### 2. Live Match Viewer
- **Match clock** synced to event minute/second
- **Event feed:** scrolling timeline of events
- **Score display:** real-time updates on goals
- **Event types:** goals, shots, fouls, cards, penalties
- **Polling:** `/fixtures/:id/events?afterEventId=X` every 500ms
- **Auto-stop** on fulltime/shootout_end event

### 3. Betting Odds
- **Upcoming fixtures** with odds displayed
- **Probability bars:** visual win % for each team
- **Decimal odds:** 1.85, 2.10 format
- **Factors breakdown:** form, strength, GK rating (tooltip)

### 4. Team Stats
- **Team cards:** name, ratings (attack/defense/GK)
- **Record:** W/L, goals for/against, goal diff
- **Tournament history:** J-Cups won, runner-ups
- **Recent form:** last 10 matches
- **Player roster:** name + ratings

---

## Component Structure

```
src/
├── main.jsx
├── App.jsx
├── api/
│   └── client.js          # axios instance
├── stores/
│   └── useMatchStore.js   # zustand store
├── pages/
│   ├── Home.jsx
│   ├── FixtureList.jsx
│   ├── FixtureDetail.jsx
│   ├── LiveMatch.jsx
│   ├── TeamList.jsx
│   ├── TeamDetail.jsx
│   └── OddsList.jsx
├── components/
│   ├── layout/
│   │   ├── Navbar.jsx
│   │   └── Footer.jsx
│   ├── fixtures/
│   │   ├── FixtureCard.jsx
│   │   ├── MatchReport.jsx
│   │   └── EventTimeline.jsx
│   ├── live/
│   │   ├── MatchClock.jsx
│   │   ├── LiveScore.jsx
│   │   └── EventFeed.jsx
│   ├── teams/
│   │   ├── TeamCard.jsx
│   │   ├── PlayerList.jsx
│   │   └── FormIndicator.jsx
│   └── odds/
│       ├── OddsCard.jsx
│       └── ProbabilityBar.jsx
└── utils/
    └── formatters.js      # date, odds formatting
```

---

## API Integration

### Endpoints Used

```js
// Teams
GET /api/teams                    // all teams
GET /api/teams/3jcup              // top 16 by cups won

// Players
GET /api/players/team/:teamName   // players by team

// Fixtures
GET /api/fixtures                 // all fixtures (?status=live, ?limit=10)
GET /api/fixtures/:id             // single fixture w/ odds
GET /api/fixtures/:id/report      // match statistics
GET /api/fixtures/:id/events      // all events
GET /api/fixtures/:id/events?afterEventId=X  // live polling
GET /api/fixtures/:id/goals       // goals only

// Odds
GET /api/fixtures/:id/odds        // fixture odds
```

---

## Live Match Implementation

```jsx
// Polling logic
const [events, setEvents] = useState([])
const [lastEventId, setLastEventId] = useState(0)
const [isLive, setIsLive] = useState(true)

useEffect(() => {
  if (!isLive) return

  const poll = setInterval(async () => {
    const res = await api.get(`/fixtures/${id}/events?afterEventId=${lastEventId}`)
    if (res.data.length) {
      setEvents(prev => [...prev, ...res.data])
      setLastEventId(res.data[res.data.length - 1].event_id)

      // Check for match end
      const endEvents = ['fulltime', 'shootout_end']
      if (res.data.some(e => endEvents.includes(e.event_type))) {
        setIsLive(false)
      }
    }
  }, 500)

  return () => clearInterval(poll)
}, [id, lastEventId, isLive])
```

### Event Type Icons
| Event | Icon |
|-------|------|
| goal | ⚽ |
| shot_saved | 🧤 |
| shot_missed | ❌ |
| yellow_card | 🟨 |
| red_card | 🟥 |
| foul | ⚠️ |
| corner | 🚩 |
| penalty_awarded | 🎯 |
| kickoff | 🏁 |
| halftime | ⏸️ |
| fulltime | 🏆 |

---

## UI/UX Notes

### Color Scheme
- Primary: `#10b981` (emerald)
- Bg: `#0f172a` (slate-900) - dark theme
- Cards: `#1e293b` (slate-800)
- Text: `#f8fafc` (slate-50)

### Responsive
- Mobile-first design
- Cards stack vertically on sm screens
- Live match: full-screen option on mobile

### Loading States
- Skeleton loaders for fixture cards
- Pulse animation for live match waiting

---

## Implementation Order

1. **Phase 1: Setup**
   - Vite + React init
   - TailwindCSS config
   - Axios client + API base
   - React Router setup
   - Basic layout (Navbar)

2. **Phase 2: Teams**
   - TeamList page
   - TeamCard component
   - TeamDetail page w/ players

3. **Phase 3: Fixtures**
   - FixtureList page w/ tabs
   - FixtureCard component
   - FixtureDetail page
   - MatchReport component

4. **Phase 4: Live Match**
   - LiveMatch page
   - MatchClock component
   - EventFeed component
   - Polling implementation

5. **Phase 5: Odds**
   - OddsList page
   - OddsCard component
   - ProbabilityBar component

6. **Phase 6: Polish**
   - Loading states
   - Error handling
   - Mobile optimization
   - Home dashboard

---

## Unresolved Questions

- Trigger match sim from frontend or just watch existing?
- Store fixture data in zustand or fetch fresh each page?
- Dark mode only or toggle?
- Tournament bracket visualization needed?
- Notification/toast on goals during live match?
