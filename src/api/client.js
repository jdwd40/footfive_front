import axios from 'axios'
import { normalizeLiveEventsList } from '../utils/liveEventModel'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'https://jwd1.xyz/api'
const adminSecret = import.meta.env.VITE_ADMIN_SECRET || ''

const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[API Error]', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

// Transform team data from API format to our format
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
})

// Transform fixture data from API format to our format
const transformFixture = (fixture) => ({
  fixture_id: fixture.fixtureId,
  home_team: fixture.homeTeam?.name,
  away_team: fixture.awayTeam?.name,
  home_team_id: fixture.homeTeam?.id,
  away_team_id: fixture.awayTeam?.id,
  home_score: fixture.score?.home ?? null,
  away_score: fixture.score?.away ?? null,
  status: fixture.status,
  state: fixture.state, // Include state field as fallback for status
  scheduled_time: fixture.scheduledAt,
  completed_time: fixture.completedAt,
  round: fixture.round,
  tournament_name: 'J-Cup',
})

// Transform event data from API format
const transformEvent = (event) => ({
  event_id: event.eventId || event.id,
  event_type: event.type || event.eventType,
  minute: event.minute,
  second: event.second,
  team_name: event.team?.name || event.teamName,
  player_name: event.player?.name || event.playerName,
})

// J-Cup Tournament API
export const jcupApi = {
  // Initialize a new tournament
  init: async () => {
    const { data } = await api.get('/jcup/init')
    return data
  },

  // Play the next round (simulates all matches in current round)
  play: async () => {
    const { data } = await api.get('/jcup/play')
    return data
  },

  // End tournament and record winner/runner-up
  end: async (winnerId, runnerId) => {
    const { data } = await api.post('/jcup/end', {
      winner_id: winnerId,
      runner_id: runnerId
    })
    return data
  },
}

// Teams API
export const teamsApi = {
  getAll: async () => {
    const { data } = await api.get('/teams')
    return { data: (data.teams || []).map(transformTeam) }
  },
  getTop16: async () => {
    const { data } = await api.get('/teams')
    return { data: (data.teams || []).map(transformTeam) }
  },
  getByName: async (name) => {
    const { data } = await api.get('/teams')
    const team = (data.teams || []).find(t => t.name === name)
    return { data: team ? transformTeam(team) : null }
  },
}

// Players API
export const playersApi = {
  getByTeam: async (teamName) => {
    try {
      const { data } = await api.get(`/players/team/${encodeURIComponent(teamName)}`)
      return { data: data.players || data || [] }
    } catch {
      return { data: [] }
    }
  },
}

// Fixtures API
export const fixturesApi = {
  getAll: async (params = {}) => {
    const { data } = await api.get('/fixtures', { params })
    const fixtures = (data.fixtures || []).map(transformFixture)
    
    // Filter by status if provided
    if (params.status) {
      return { data: fixtures.filter(f => f.status === params.status) }
    }
    return { data: fixtures }
  },
  
  create: async (homeTeamId, awayTeamId, round = 'Friendly') => {
    const { data } = await api.post('/fixtures', {
      homeTeamId,
      awayTeamId,
      round
    })
    return data
  },
  
  simulate: async (id) => {
    const { data } = await api.post(`/fixtures/${id}/simulate`)
    return data
  },
  
  getById: async (id) => {
    try {
      const { data } = await api.get(`/fixtures/${id}`)
      return { data: transformFixture(data.fixture || data) }
    } catch {
      // Try to find in all fixtures
      const { data } = await api.get('/fixtures')
      const fixture = (data.fixtures || []).find(f => f.fixtureId == id)
      return { data: fixture ? transformFixture(fixture) : null }
    }
  },
  
  getReport: async (id) => {
    try {
      const { data } = await api.get(`/fixtures/${id}/report`)
      // Transform report format
      const report = data.report?.stats
      if (report) {
        return {
          data: {
            home_possession: report.home?.possession,
            away_possession: report.away?.possession,
            home_shots: report.home?.shots,
            away_shots: report.away?.shots,
            home_shots_on_target: report.home?.shotsOnTarget,
            away_shots_on_target: report.away?.shotsOnTarget,
            home_corners: report.home?.corners,
            away_corners: report.away?.corners,
            home_fouls: report.home?.fouls,
            away_fouls: report.away?.fouls,
            home_yellows: report.home?.yellowCards,
            away_yellows: report.away?.yellowCards,
            home_reds: report.home?.redCards,
            away_reds: report.away?.redCards,
          }
        }
      }
      return { data: null }
    } catch {
      return { data: null }
    }
  },
  
  getEvents: async (id, afterEventId = null) => {
    try {
      const params = afterEventId ? { afterEventId } : {}
      const { data } = await api.get(`/fixtures/${id}/events`, { params })
      const events = (data.events || data || []).map(transformEvent)
      return { data: events }
    } catch {
      return { data: [] }
    }
  },
  
  getGoals: async (id) => {
    try {
      const { data } = await api.get(`/fixtures/${id}/goals`)
      return { data: data.goals || data || [] }
    } catch {
      return { data: [] }
    }
  },
  
  getOdds: async (id) => {
    try {
      const { data } = await api.get(`/fixtures/${id}/odds`)
      return { data: data.odds || data }
    } catch {
      return { data: null }
    }
  },
}

// Live Simulation API
export const liveApi = {
  // Get full system status including simulation and tournament info
  getStatus: async () => {
    const { data } = await api.get('/live/status')
    return data
  },

  // Get current tournament state snapshot
  getTournament: async () => {
    const { data } = await api.get('/live/tournament')
    return data
  },

  // Get all currently active matches
  getMatches: async () => {
    const { data } = await api.get('/live/matches')
    return data
  },

  // Get all fixtures for current tournament (completed + active + upcoming)
  getFixtures: async () => {
    const { data } = await api.get('/live/fixtures')
    return data
  },

  // Get single match detail with stats
  getMatch: async (fixtureId) => {
    const { data } = await api.get(`/live/matches/${fixtureId}`)
    return data
  },

  // Get recent events from memory buffer (events normalized to unified live shape)
  getRecentEvents: async (params = {}) => {
    const { data } = await api.get('/live/events/recent', { params })
    return {
      ...data,
      events: normalizeLiveEventsList(data.events || []),
    }
  },

  // Start a new tournament (requires admin auth: set VITE_ADMIN_SECRET to match backend ADMIN_SECRET, or backend DEV_ADMIN=true)
  startTournament: async () => {
    const headers = {}
    if (adminSecret) headers['X-Admin-Secret'] = adminSecret
    
    const url = `${baseURL}/admin/tournament/start`
    console.log('[startTournament] Request details:', {
      url,
      method: 'POST',
      headers,
      body: {}
    })
    
    try {
      const { data } = await api.post('/admin/tournament/start', {}, { headers })
      console.log('[startTournament] Success:', data)
      return data
    } catch (error) {
      console.error('[startTournament] Error details:', {
        url,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        message: error.message,
        code: error.code,
        isNetworkError: !error.response
      })
      throw error
    }
  },

  // Get SSE stream URL for real-time events
  getEventsStreamUrl: (params = {}) => {
    const baseUrl = api.defaults.baseURL
    const queryParams = new URLSearchParams()

    if (params.fixtureId) queryParams.set('fixtureId', params.fixtureId)
    if (params.tournamentId) queryParams.set('tournamentId', params.tournamentId)
    if (params.category) queryParams.set('category', params.category)
    if (params.afterSeq != null && params.afterSeq !== '') {
      queryParams.set('afterSeq', String(params.afterSeq))
    }

    const queryString = queryParams.toString()
    return `${baseUrl}/live/events${queryString ? `?${queryString}` : ''}`
  },
}

export { normalizeLiveEvent, normalizeLiveEventsList } from '../utils/liveEventModel'

export default api
