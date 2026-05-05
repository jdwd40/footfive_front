import { create } from 'zustand'
import { liveApi } from '../api/client'
import {
  normalizeLiveEvent,
  dedupeLiveEventsBySeq,
  sortLiveEventsDesc,
} from '../utils/liveEventModel'
import { isTournamentPlayingState, isTournamentBreakLikeState } from '../utils/tournamentPhases'

// Tournament state labels (v2 event-driven + legacy state names)
const TOURNAMENT_STATE_LABELS = {
  IDLE: 'Waiting for Tournament',
  SETUP: 'Tournament Starting Soon',
  ROUND_ACTIVE: 'Round In Progress',
  ROUND_COMPLETE: 'Round Complete',
  INTER_ROUND_DELAY: 'Next Round Starting Soon',
  ROUND_OF_16: 'Round of 16',
  QF_BREAK: 'Quarter-Finals Starting',
  QUARTER_FINALS: 'Quarter-Finals',
  SF_BREAK: 'Semi-Finals Starting',
  SEMI_FINALS: 'Semi-Finals',
  FINAL_BREAK: 'Final Starting',
  FINAL: 'The Final',
  RESULTS: 'Tournament Complete',
  COMPLETE: 'Tournament Complete',
}

// Match state labels
const MATCH_STATE_LABELS = {
  SCHEDULED: 'Scheduled',
  FIRST_HALF: '1st Half',
  HALFTIME: 'Half Time',
  SECOND_HALF: '2nd Half',
  EXTRA_TIME_1: 'ET 1st',
  ET_HALFTIME: 'ET Break',
  EXTRA_TIME_2: 'ET 2nd',
  PENALTIES: 'Penalties',
  FINISHED: 'Full Time',
}

// Round order for sorting / progression
const ROUND_ORDER = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']

/** Legacy: map tournament.state -> display round when API omits currentRound */
const LEGACY_STATE_TO_ROUND = {
  ROUND_OF_16: 'Round of 16',
  QF_BREAK: 'Quarter-finals',
  QUARTER_FINALS: 'Quarter-finals',
  SF_BREAK: 'Semi-finals',
  SEMI_FINALS: 'Semi-finals',
  FINAL_BREAK: 'Final',
  FINAL: 'Final',
}

const LEGACY_STATE_TO_NEXT_ROUND = {
  SETUP: 'Round of 16',
  ROUND_OF_16: 'Quarter-finals',
  QF_BREAK: 'Quarter-finals',
  QUARTER_FINALS: 'Semi-finals',
  SF_BREAK: 'Semi-finals',
  SEMI_FINALS: 'Final',
  FINAL_BREAK: 'Final',
}

function currentRoundFromTournament(tournament) {
  if (!tournament) return null
  const fromApi =
    tournament.currentRound ??
    tournament.currentRoundName ??
    tournament.currentRoundKey
  const normalized = normalizeRound(fromApi)
  if (normalized) return normalized
  return LEGACY_STATE_TO_ROUND[tournament.state] || null
}

function nextRoundFromTournament(tournament) {
  if (!tournament) return null
  const explicit = tournament.nextRound ?? tournament.nextRoundName ?? tournament.nextRoundKey
  const n = normalizeRound(explicit)
  if (n) return n
  const cur = currentRoundFromTournament(tournament)
  if (cur) {
    const idx = ROUND_ORDER.indexOf(cur)
    if (idx >= 0 && idx < ROUND_ORDER.length - 1) return ROUND_ORDER[idx + 1]
  }
  return LEGACY_STATE_TO_NEXT_ROUND[tournament?.state] || null
}

const ROUND_NORMALIZATION = [
  { keys: ['roundof16', 'r16', 'round16', 'roundofsixteen'], value: 'Round of 16' },
  { keys: ['quarterfinals', 'quarter-finals', 'quarterfinal', 'quarter finals', 'qf'], value: 'Quarter-finals' },
  { keys: ['semifinals', 'semi-finals', 'semifinal', 'semi finals', 'sf'], value: 'Semi-finals' },
  { keys: ['final', 'finals'], value: 'Final' },
]

function normalizeRound(name) {
  if (!name) return null
  const key = name.toString().toLowerCase().replace(/[\s-]/g, '')
  const found = ROUND_NORMALIZATION.find(entry => entry.keys.includes(key))
  return found ? found.value : null
}

// Resolve teams from bracket structure for fixtures with null teams
// This looks at feeder matches (matches whose feedsInto equals this fixture's bracketSlot)
// and uses the winners from those matches
function resolveTeamsFromBracket(fixtures) {
  if (!fixtures || fixtures.length === 0) return fixtures

  // Build a map of bracketSlot -> fixture for quick lookup
  const slotToFixture = {}
  fixtures.forEach(f => {
    if (f.bracketSlot) {
      slotToFixture[f.bracketSlot] = f
    }
  })

  // Find feeder matches for each fixture
  const feedersMap = {} // bracketSlot -> [feeder fixtures]
  fixtures.forEach(f => {
    if (f.feedsInto) {
      if (!feedersMap[f.feedsInto]) {
        feedersMap[f.feedsInto] = []
      }
      feedersMap[f.feedsInto].push(f)
    }
  })

  // Helper to get winner team from a finished match
  const getWinnerTeam = (match) => {
    if (!match || !match.isFinished) return null

    // Use winnerId if available
    if (match.winnerId) {
      if (match.homeTeam?.id === match.winnerId) return match.homeTeam
      if (match.awayTeam?.id === match.winnerId) return match.awayTeam
    }

    // Fall back to score comparison
    const homeScore = (match.score?.home || 0) + (match.penaltyScore?.home || 0) * 0.001
    const awayScore = (match.score?.away || 0) + (match.penaltyScore?.away || 0) * 0.001

    if (homeScore > awayScore) return match.homeTeam
    if (awayScore > homeScore) return match.awayTeam

    return null
  }

  // Resolve teams for fixtures with null homeTeam or awayTeam
  return fixtures.map(fixture => {
    // If both teams are already set, no need to resolve
    if (fixture.homeTeam && fixture.awayTeam) return fixture

    // Find feeder matches for this fixture
    const feeders = feedersMap[fixture.bracketSlot] || []
    if (feeders.length === 0) return fixture

    // Sort feeders by their bracketSlot to ensure consistent ordering
    // e.g., R16_1 and R16_2 feed into QF1, where R16_1 winner is home, R16_2 winner is away
    feeders.sort((a, b) => (a.bracketSlot || '').localeCompare(b.bracketSlot || ''))

    let resolvedHomeTeam = fixture.homeTeam
    let resolvedAwayTeam = fixture.awayTeam

    // First feeder's winner goes to homeTeam
    if (!resolvedHomeTeam && feeders[0]) {
      resolvedHomeTeam = getWinnerTeam(feeders[0])
    }

    // Second feeder's winner goes to awayTeam
    if (!resolvedAwayTeam && feeders[1]) {
      resolvedAwayTeam = getWinnerTeam(feeders[1])
    }

    // Return updated fixture if anything changed
    if (resolvedHomeTeam !== fixture.homeTeam || resolvedAwayTeam !== fixture.awayTeam) {
      return {
        ...fixture,
        homeTeam: resolvedHomeTeam,
        awayTeam: resolvedAwayTeam,
      }
    }

    return fixture
  })
}

export const useLiveStore = create((set, get) => ({
  // Connection state
  connected: false,
  connecting: false,
  error: null,
  lastUpdated: null,

  // Simulation state
  simulation: null,

  // Tournament state
  tournament: null,
  // Last completed tournament snapshot (kept until next tournament starts)
  lastCompletedTournament: null,
  lastCompletedFixtures: [],

  // All fixtures for current tournament (completed + active + upcoming)
  fixtures: [],

  // Active matches (currently being played) - kept for backward compatibility
  matches: [],

  // Completed matches in current tournament - kept for backward compatibility
  completedMatches: [],

  // Upcoming fixtures for next round (available during both active rounds and breaks)
  upcomingFixtures: [],

  // Recent events buffer (all events from current round)
  recentEvents: [],

  /** @type {Record<string, object[]>} Per-fixture event cache for drop-in viewers */
  matchEventsByFixtureId: {},

  // Loading states
  isLoading: false,
  isInitialLoad: true,

  // Auto-cycle state (persists across navigation so countdown continues)
  // Phase: null | 'WINNER_DISPLAY' | 'STARTING_TOURNAMENT' | 'FIXTURES_PREVIEW'
  autoCyclePhase: null,
  autoCyclePhaseStartTime: null,
  autoCycledTournamentId: null,

  // Actions
  setConnected: (connected) => set({ connected }),
  setConnecting: (connecting) => set({ connecting }),
  setError: (error) => set({ error }),

  // Fetch full snapshot (status + fixtures)
  fetchSnapshot: async () => {
    set({ isLoading: true, error: null })

    try {
      const [statusRes, fixturesRes] = await Promise.all([
        liveApi.getStatus(),
        liveApi.getFixtures().catch(() => ({ fixtures: [] })),
      ])

      const rawFixtures = fixturesRes.fixtures || []
      // Resolve teams from bracket structure for fixtures with null teams
      const allFixtures = resolveTeamsFromBracket(rawFixtures)
      const newTournament = statusRes.tournament
      const newTournamentId = newTournament?.tournamentId
      const newState = newTournament?.state

      set(state => {
        let tournamentToSet = newTournament
        let lastCompletedTournament = state.lastCompletedTournament
        let lastCompletedFixtures = state.lastCompletedFixtures

        const lastCompletedId = state.lastCompletedTournament?.tournamentId

        // If tournament completed, cache it immediately
        if (newState === 'RESULTS' || newState === 'COMPLETE') {
          lastCompletedTournament = newTournament
          lastCompletedFixtures = allFixtures.length > 0 ? allFixtures : state.lastCompletedFixtures
        }

        // Only clear last completed cache when a new tournament actually has matches playing
        // (not during SETUP/IDLE when we still want to show previous results)
        const hasActiveMatches = allFixtures.some(m => m.state !== 'FINISHED' && m.state !== 'SCHEDULED' && !m.isFinished)
        if (newTournamentId && lastCompletedId && newTournamentId !== lastCompletedId && hasActiveMatches) {
          lastCompletedTournament = null
          lastCompletedFixtures = []
        }

        // During SETUP or IDLE with no fixtures, keep showing last completed tournament
        const isWaitingState = newState === 'SETUP' || newState === 'IDLE' || !newState
        if (isWaitingState && allFixtures.length === 0 && lastCompletedFixtures.length > 0) {
          // Keep showing last tournament results while waiting
          return {
            ...state,
            simulation: statusRes.simulation,
            tournament: newTournament,
            fixtures: lastCompletedFixtures,
            matches: [],
            completedMatches: lastCompletedFixtures,
            upcomingFixtures: [],
            lastCompletedTournament,
            lastCompletedFixtures,
            isLoading: false,
            isInitialLoad: false,
            lastUpdated: Date.now(),
            error: null,
          }
        }

        // IMPORTANT: Merge API fixtures with current state to prevent SSE updates from being overwritten
        // State progression order (higher index = more advanced state)
        const STATE_ORDER = ['SCHEDULED', 'FIRST_HALF', 'HALFTIME', 'SECOND_HALF', 'EXTRA_TIME_1', 'ET_HALFTIME', 'EXTRA_TIME_2', 'PENALTIES', 'FINISHED']

        const mergedFixtures = allFixtures.map(apiFixture => {
          // Find existing fixture in current state
          const existingFixture = state.fixtures.find(f =>
            f.fixtureId == apiFixture.fixtureId || String(f.fixtureId) === String(apiFixture.fixtureId)
          )

          if (!existingFixture) return apiFixture

          // Get state indices (higher = more advanced)
          const apiStateIdx = STATE_ORDER.indexOf(apiFixture.state)
          const existingStateIdx = STATE_ORDER.indexOf(existingFixture.state)

          // If existing state is more advanced (from SSE), keep it
          // This prevents polling from reverting SSE updates
          if (existingStateIdx > apiStateIdx && existingStateIdx >= 0) {
            console.log(`[LiveStore] Preserving SSE state for fixture ${apiFixture.fixtureId}: ${existingFixture.state} > ${apiFixture.state}`)
            return {
              ...apiFixture,
              state: existingFixture.state,
              minute: existingFixture.minute || apiFixture.minute,
              score: existingFixture.score || apiFixture.score,
              penaltyScore: existingFixture.penaltyScore || apiFixture.penaltyScore,
              isFinished: existingFixture.isFinished,
            }
          }

          return apiFixture
        })

        // Separate active matches from completed for backward compatibility
        const activeMatches = mergedFixtures.filter(m => m.state !== 'FINISHED' && !m.isFinished)
        const finishedMatches = mergedFixtures.filter(m => m.state === 'FINISHED' || m.isFinished)

        // Determine next round fixtures - always show upcoming fixtures for the next round
        // This works during both active rounds AND break periods
        const nextRoundName = normalizeRound(nextRoundFromTournament(tournamentToSet))

        // Filter for SCHEDULED fixtures in the next round only
        // STRICT check: only explicit SCHEDULED state counts as upcoming
        // A match with ANY score (including 0-0) is NOT upcoming
        const upcomingFixtures = nextRoundName
          ? mergedFixtures.filter(m => {
            const matchRound = normalizeRound(m.round)
            const isExplicitlyScheduled = m.state === 'SCHEDULED'
            const hasNullScore = m.score?.home == null && m.score?.away == null
            const isNotFinished = !m.isFinished && m.state !== 'FINISHED'

            return matchRound === nextRoundName && isExplicitlyScheduled && hasNullScore && isNotFinished
          })
          : []

        // If the server says we're in a live round or have active matches, clear auto-cycle
        // so the Live Dashboard shows the actual tournament instead of a stale countdown
        // (e.g. tournament was started by another tab or by the backend)
        const isLiveRound = isTournamentPlayingState(newState)
        const hasActiveMatchesNow = activeMatches.length > 0
        const clearAutoCycleState = isLiveRound || hasActiveMatchesNow
          ? { autoCyclePhase: null, autoCyclePhaseStartTime: null, autoCycledTournamentId: null }
          : {}

        return {
          simulation: statusRes.simulation,
          tournament: newTournament, // Always use actual tournament state for header
          fixtures: mergedFixtures,
          matches: activeMatches,
          completedMatches: finishedMatches,
          upcomingFixtures,
          lastCompletedTournament,
          lastCompletedFixtures,
          isLoading: false,
          isInitialLoad: false,
          lastUpdated: Date.now(),
          error: null,
          ...clearAutoCycleState,
        }
      })

      return { status: statusRes, fixtures: fixturesRes }
    } catch (err) {
      console.error('[LiveStore] fetchSnapshot error:', err)

      // Try fallback - set a default IDLE state so the page still renders
      set({
        tournament: { state: 'IDLE', tournamentId: null },
        fixtures: [],
        matches: [],
        completedMatches: [],
        error: err.message || 'Failed to fetch live data',
        isLoading: false,
        isInitialLoad: false,
      })
    }
  },

  // Fetch just tournament status (lightweight)
  fetchTournament: async () => {
    try {
      const data = await liveApi.getTournament()
      set({ tournament: data, lastUpdated: Date.now() })
      return data
    } catch (err) {
      console.error('Failed to fetch tournament:', err)
      throw err
    }
  },

  // Fetch just matches (lightweight)
  fetchMatches: async () => {
    try {
      const data = await liveApi.getMatches()
      set({ matches: data.matches || [], lastUpdated: Date.now() })
      return data
    } catch (err) {
      console.error('Failed to fetch matches:', err)
      throw err
    }
  },

  // Handle incoming SSE event
  handleEvent: (event) => {
    const normalized = normalizeLiveEvent(event) || event
    const { type, fixtureId, score, penaltyScore, minute, second } = normalized

    set((state) => {
      let matchEventsByFixtureId = state.matchEventsByFixtureId
      if (fixtureId != null && normalized.type !== 'connected') {
        const key = String(fixtureId)
        const prev = matchEventsByFixtureId[key] || []
        const next = dedupeLiveEventsBySeq([...prev, normalized]).slice(-150)
        matchEventsByFixtureId = { ...matchEventsByFixtureId, [key]: next }
      }
      return {
        matchEventsByFixtureId,
        recentEvents: [...state.recentEvents, normalized].slice(-80),
        lastUpdated: Date.now(),
      }
    })

    // Helper to match fixture IDs (handles type mismatches between string/number)
    const matchesFixtureId = (m, targetId) => {
      if (!m?.fixtureId || !targetId) return false
      // Use loose equality to handle string/number mismatches
      return m.fixtureId == targetId || String(m.fixtureId) === String(targetId)
    }

    if (fixtureId) {
      const liveUpdates = {}
      if (minute != null) liveUpdates.minute = minute
      if (second != null) liveUpdates.second = second
      if (score) liveUpdates.score = score
      if (penaltyScore) liveUpdates.penaltyScore = penaltyScore

      if (Object.keys(liveUpdates).length > 0) {
        set(state => ({
          fixtures: state.fixtures.map(m =>
            matchesFixtureId(m, fixtureId) ? { ...m, ...liveUpdates } : m
          ),
          matches: state.matches.map(m =>
            matchesFixtureId(m, fixtureId) ? { ...m, ...liveUpdates } : m
          ),
          completedMatches: state.completedMatches.map(m =>
            matchesFixtureId(m, fixtureId) ? { ...m, ...liveUpdates } : m
          ),
        }))
      }
    }

    // Handle specific event types
    switch (type) {
      case 'goal':
      case 'penalty_scored':
      case 'shootout_goal':
        // Update match score in fixtures array
        if (fixtureId && score) {
          set(state => ({
            fixtures: state.fixtures.map(m =>
              matchesFixtureId(m, fixtureId)
                ? { ...m, score, penaltyScore: penaltyScore || m.penaltyScore }
                : m
            ),
            matches: state.matches.map(m =>
              matchesFixtureId(m, fixtureId)
                ? { ...m, score, penaltyScore: penaltyScore || m.penaltyScore }
                : m
            )
          }))
        }
        break

      case 'halftime':
      case 'second_half_start':
      case 'extra_time_start':
      case 'et_halftime':
      case 'extra_time_half':
      case 'extra_time_2_start':
      case 'extra_time_end':
      case 'shootout_start':
        // Update match state in fixtures array (but NOT fulltime - that doesn't end knockout matches!)
        if (fixtureId) {
          const stateMap = {
            halftime: 'HALFTIME',
            second_half_start: 'SECOND_HALF',
            extra_time_start: 'EXTRA_TIME_1',
            et_halftime: 'ET_HALFTIME',
            extra_time_half: 'ET_HALFTIME',
            extra_time_2_start: 'EXTRA_TIME_2',
            extra_time_end: 'EXTRA_TIME_2',
            shootout_start: 'PENALTIES',
          }
          const newState = stateMap[type]
          if (newState) {
            set(state => ({
              fixtures: state.fixtures.map(m =>
                matchesFixtureId(m, fixtureId) ? { ...m, state: newState, isFinished: false } : m
              ),
              matches: state.matches.map(m =>
                matchesFixtureId(m, fixtureId) ? { ...m, state: newState } : m
              )
            }))
          }
        }
        break

      case 'fulltime':
        // fulltime = end of 90 minutes, NOT the end of match in knockout tournaments
        // In knockout, if scores are tied, match continues to extra time
        // Do NOT mark as finished - wait for match_end event
        console.log('[LiveStore] fulltime event - match may continue to extra time if tied')
        break

      case 'match_start':
        // Update match state in fixtures array - handles simultaneous match starts
        set(state => {
          const fixtureExists = state.fixtures.some(m => matchesFixtureId(m, fixtureId))
          if (fixtureExists) {
            const updatedFixtures = state.fixtures.map(m =>
              matchesFixtureId(m, fixtureId)
                ? { ...m, state: 'FIRST_HALF', isFinished: false, score: m.score || { home: 0, away: 0 } }
                : m
            )
            // Find the updated fixture to add to active matches if not already there
            const startedMatch = updatedFixtures.find(m => matchesFixtureId(m, fixtureId))
            const matchExists = state.matches.some(m => matchesFixtureId(m, fixtureId))

            return {
              fixtures: updatedFixtures,
              // Add to matches array if not already tracking it
              matches: matchExists
                ? state.matches.map(m => matchesFixtureId(m, fixtureId)
                  ? { ...m, state: 'FIRST_HALF', score: m.score || { home: 0, away: 0 } }
                  : m)
                : startedMatch
                  ? [...state.matches, startedMatch]
                  : state.matches,
              // Remove from upcoming if it was there
              upcomingFixtures: state.upcomingFixtures.filter(m => !matchesFixtureId(m, fixtureId))
            }
          }
          // If fixture doesn't exist and we have team data, add it
          if (normalized.homeTeam && normalized.awayTeam) {
            const newFixture = {
              fixtureId,
              state: 'FIRST_HALF',
              minute: 0,
              score: { home: 0, away: 0 },
              penaltyScore: { home: 0, away: 0 },
              homeTeam: normalized.homeTeam,
              awayTeam: normalized.awayTeam,
              isFinished: false,
              round: normalized.round || currentRoundFromTournament(state.tournament) || 'Round of 16',
            }
            return {
              fixtures: [...state.fixtures, newFixture],
              matches: [...state.matches, newFixture]
            }
          }
          // Fixture not found and no team data - trigger a refetch to get latest state
          console.warn('[LiveStore] match_start for unknown fixture:', fixtureId, '- triggering refetch')
          setTimeout(() => get().fetchSnapshot(), 100)
          return state
        })
        break

      case 'match_end':
      case 'shootout_end':
        // Update fixture to finished state - this is when the match truly ends
        set(state => {
          const fixture = state.fixtures.find(m => matchesFixtureId(m, fixtureId))
          if (fixture) {
            const updatedFixture = {
              ...fixture,
              isFinished: true,
              state: 'FINISHED',
              score: score || fixture.score,
              penaltyScore: penaltyScore || fixture.penaltyScore,
            }
            return {
              fixtures: state.fixtures.map(m => matchesFixtureId(m, fixtureId) ? updatedFixture : m),
              matches: state.matches.filter(m => !matchesFixtureId(m, fixtureId)),
              completedMatches: state.completedMatches.some(m => matchesFixtureId(m, fixtureId))
                ? state.completedMatches.map(m => matchesFixtureId(m, fixtureId) ? updatedFixture : m)
                : [...state.completedMatches, updatedFixture],
            }
          }
          return state
        })
        break

      case 'round_start':
        // Start ALL matches for this round immediately
        // This ensures all matches in a round start simultaneously
        set(state => {
          const roundName = event.round || event.roundName

          // If we have explicit match IDs from the event, use those
          if (event.fixtureIds && Array.isArray(event.fixtureIds)) {
            return {
              fixtures: state.fixtures.map(m => {
                if (event.fixtureIds.includes(m.fixtureId) || event.fixtureIds.includes(String(m.fixtureId))) {
                  return { ...m, state: 'FIRST_HALF', score: m.score || { home: 0, away: 0 }, isFinished: false }
                }
                return m
              }),
              matches: state.fixtures
                .filter(m => event.fixtureIds.includes(m.fixtureId) || event.fixtureIds.includes(String(m.fixtureId)))
                .map(m => ({ ...m, state: 'FIRST_HALF', score: m.score || { home: 0, away: 0 }, isFinished: false }))
            }
          }

          // Otherwise, start all SCHEDULED matches for the given round
          if (roundName) {
            const normalizedRound = normalizeRound(roundName)
            return {
              fixtures: state.fixtures.map(m => {
                const matchRound = normalizeRound(m.round)
                if (matchRound === normalizedRound && m.state === 'SCHEDULED') {
                  return { ...m, state: 'FIRST_HALF', score: m.score || { home: 0, away: 0 }, isFinished: false }
                }
                return m
              }),
              matches: state.fixtures
                .filter(m => normalizeRound(m.round) === normalizedRound)
                .map(m => m.state === 'SCHEDULED'
                  ? { ...m, state: 'FIRST_HALF', score: m.score || { home: 0, away: 0 }, isFinished: false }
                  : m
                )
            }
          }

          return state
        })
        // Also refetch to ensure consistency with backend
        get().fetchSnapshot()
        break

      case 'round_complete':
        // Refetch to get updated tournament state
        get().fetchSnapshot()
        break

      case 'state_change':
      case 'tournament_state':
        // Tournament state changed - refetch everything
        get().fetchSnapshot()
        break

      case 'tournament_end':
        // Tournament complete - show winner
        set(state => ({
          tournament: state.tournament
            ? {
              ...state.tournament,
              state: 'RESULTS',
              winner: event.winner,
              runnerUp: event.runnerUp,
            }
            : state.tournament
        }))
        break

      default:
        // Ignore other events
        break
    }
  },

  // Update single match (from minute tick or detail fetch)
  updateMatch: (fixtureId, updates) => {
    set(state => ({
      fixtures: state.fixtures.map(m =>
        (m.fixtureId == fixtureId || String(m.fixtureId) === String(fixtureId)) ? { ...m, ...updates } : m
      ),
      matches: state.matches.map(m =>
        (m.fixtureId == fixtureId || String(m.fixtureId) === String(fixtureId)) ? { ...m, ...updates } : m
      )
    }))
  },

  // Get match by ID
  getMatch: (fixtureId) => {
    return get().matches.find(m => m.fixtureId == fixtureId || String(m.fixtureId) === String(fixtureId))
  },

  // Get tournament state label
  getTournamentStateLabel: () => {
    const { tournament } = get()
    if (!tournament?.state) return 'Loading...'
    return TOURNAMENT_STATE_LABELS[tournament.state] || tournament.state
  },

  // Get match state label
  getMatchStateLabel: (state) => {
    return MATCH_STATE_LABELS[state] || state
  },

  // Check if tournament is active (matches being played)
  isTournamentActive: () => {
    const { tournament } = get()
    if (!tournament?.state) return false
    return isTournamentPlayingState(tournament.state)
  },

  // Check if in break period
  isBreakPeriod: () => {
    const { tournament } = get()
    return isTournamentBreakLikeState(tournament?.state)
  },

  // Get current round name
  getCurrentRound: () => {
    const { tournament } = get()
    return currentRoundFromTournament(tournament)
  },

  // Get next round name (works for both active rounds and break periods)
  getNextRound: () => {
    const { tournament } = get()
    return nextRoundFromTournament(tournament)
  },

  // Get all matches for bracket (active + completed)
  getAllBracketMatches: () => {
    const { fixtures, matches, completedMatches } = get()
    // Prefer fixtures array if available, otherwise fall back to combined arrays
    return fixtures.length > 0 ? fixtures : [...completedMatches, ...matches]
  },

  // Get completed matches grouped by round
  getMatchesByRound: () => {
    const { fixtures, completedMatches, matches } = get()
    // Prefer fixtures array if available
    const allMatches = fixtures.length > 0 ? fixtures : [...completedMatches, ...matches]

    const grouped = {}
    ROUND_ORDER.forEach(round => {
      grouped[round] = allMatches.filter(m =>
        m.round === round ||
        m.round?.toLowerCase().includes(round.toLowerCase().replace('-', ''))
      )
    })

    return grouped
  },

  // Get matches for a specific round
  getMatchesForRound: (roundName) => {
    const { fixtures, completedMatches, matches } = get()
    // Prefer fixtures array if available
    const allMatches = fixtures.length > 0 ? fixtures : [...completedMatches, ...matches]

    return allMatches.filter(m =>
      m.round === roundName ||
      m.round?.toLowerCase().includes(roundName.toLowerCase().replace('-', ''))
    )
  },

  // Get only completed matches
  getCompletedMatches: () => {
    return get().completedMatches
  },

  // Get live (in-progress) matches
  getLiveMatches: () => {
    const { matches } = get()
    return matches.filter(m =>
      ['FIRST_HALF', 'SECOND_HALF', 'EXTRA_TIME_1', 'EXTRA_TIME_2', 'PENALTIES', 'HALFTIME', 'ET_HALFTIME'].includes(m.state)
    )
  },

  // Get recent events for a specific match (cache + global buffer)
  getEventsForMatch: (fixtureId) => {
    const { recentEvents, matchEventsByFixtureId } = get()
    const key = String(fixtureId)
    const cached = matchEventsByFixtureId[key] || []
    const fromRecent = recentEvents.filter(
      (e) => e.fixtureId == fixtureId || String(e.fixtureId) === String(fixtureId)
    )
    return sortLiveEventsDesc(dedupeLiveEventsBySeq([...cached, ...fromRecent]))
  },

  // Get goal events from recent events
  getRecentGoals: () => {
    const { recentEvents } = get()
    return recentEvents.filter(e =>
      ['goal', 'penalty_scored', 'shootout_goal'].includes(e.type)
    )
  },

  // Set upcoming fixtures
  setUpcomingFixtures: (fixtures) => set({ upcomingFixtures: fixtures }),

  // Reset store
  reset: () => set({
    connected: false,
    connecting: false,
    error: null,
    lastUpdated: null,
    simulation: null,
    tournament: null,
    lastCompletedTournament: null,
    lastCompletedFixtures: [],
    fixtures: [],
    matches: [],
    completedMatches: [],
    upcomingFixtures: [],
    recentEvents: [],
    matchEventsByFixtureId: {},
    isLoading: false,
    isInitialLoad: true,
  }),

  // Clear completed matches (for new tournament)
  clearCompletedMatches: () => set({ completedMatches: [], upcomingFixtures: [] }),

  // Clear events (on new round)
  clearEvents: () => set({ recentEvents: [], matchEventsByFixtureId: {} }),

  // Auto-cycle actions (countdown continues across navigation)
  startAutoCycleWinnerDisplay: (tournamentId) => set({
    autoCyclePhase: 'WINNER_DISPLAY',
    autoCyclePhaseStartTime: Date.now(),
    autoCycledTournamentId: tournamentId,
  }),
  setAutoCycleFixturesPreview: () => set({
    autoCyclePhase: 'FIXTURES_PREVIEW',
    autoCyclePhaseStartTime: Date.now(),
  }),
  setAutoCyclePhaseStartNow: () => set(() => ({
    autoCyclePhaseStartTime: Date.now(),
  })),
  setAutoCycleStartingTournament: () => set({ autoCyclePhase: 'STARTING_TOURNAMENT' }),
  clearAutoCycle: () => set({
    autoCyclePhase: null,
    autoCyclePhaseStartTime: null,
    autoCycledTournamentId: null,
  }),
}))

export default useLiveStore
