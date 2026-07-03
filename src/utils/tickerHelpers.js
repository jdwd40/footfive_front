import { resolveEventTeam } from './liveEventModel'
import { getEventDedupeKey } from '../hooks/pacedRevealQueue'

export const TICKER_SEPARATOR = ' • '
/** Visible gap between goal headline and match score in goal announcements */
export const TICKER_GOAL_SCORE_SEPARATOR = ' • '
export const TICKER_SPEED_STORAGE_KEY = 'footfive:tickerSpeed'
export const TICKER_SEEN_KEYS_STORAGE_PREFIX = 'footfive:tickerSeen:'

export const TICKER_SPEED_CONFIG = {
  slow: { label: 'Slow', duration: '18s' },
  normal: { label: 'Normal', duration: '12s' },
  fast: { label: 'Fast', duration: '8s' },
}

export const TICKER_PRIORITY = {
  HIGH: 0,
  MEDIUM: 1,
}

const GOAL_EVENT_TYPES = new Set(['goal', 'penalty_scored', 'penalty_goal'])
const IGNORED_SHOOTOUT_EVENT_TYPES = new Set([
  'shootout_goal',
  'shootout_save',
  'shootout_miss',
  'shootout_walkup',
  'shootout_reaction',
])
const HALFTIME_EVENT_TYPES = new Set(['halftime', 'half_time'])
const FULLTIME_EVENT_TYPES = new Set(['fulltime', 'full_time', 'match_end', 'final_score'])
const PENALTY_START_EVENT_TYPES = new Set(['shootout_start', 'penalty_shootout_start'])
const SHOOTOUT_WINNER_EVENT_TYPES = new Set(['shootout_end', 'match_winner', 'final_score'])

/**
 * @param {unknown} team
 * @returns {string}
 */
export function getTeamName(team) {
  if (team == null) return ''
  if (typeof team === 'string') return team.trim()
  if (typeof team === 'object') {
    const name =
      team.name ??
      team.teamName ??
      team.team_name ??
      team.displayName ??
      team.display_name
    if (name) return String(name).trim()
  }
  return ''
}

/**
 * @param {object} fixture
 * @returns {{ homeTeam: object | null, awayTeam: object | null, homeName: string, awayName: string }}
 */
export function getFixtureTeams(fixture) {
  if (!fixture) {
    return { homeTeam: null, awayTeam: null, homeName: '', awayName: '' }
  }
  const homeTeam =
    fixture.homeTeam ??
    fixture.home_team ??
    (fixture.homeTeamName || fixture.home_team_name
      ? { name: fixture.homeTeamName || fixture.home_team_name }
      : null)
  const awayTeam =
    fixture.awayTeam ??
    fixture.away_team ??
    (fixture.awayTeamName || fixture.away_team_name
      ? { name: fixture.awayTeamName || fixture.away_team_name }
      : null)
  const homeName = getTeamName(homeTeam) || 'Home'
  const awayName = getTeamName(awayTeam) || 'Away'
  return { homeTeam, awayTeam, homeName, awayName }
}

/**
 * @param {object[]} fixtures
 * @param {string|number} fixtureId
 * @returns {object | undefined}
 */
export function findFixtureById(fixtures, fixtureId) {
  if (fixtureId == null || !fixtures?.length) return undefined
  return fixtures.find(
    (f) => f.fixtureId == fixtureId || String(f.fixtureId) === String(fixtureId),
  )
}

/**
 * @param {object[]} fixtures
 * @returns {object[]}
 */
export function sortFixturesByBracket(fixtures) {
  return [...(fixtures || [])].sort((a, b) => {
    const slotA = a.bracketSlot ?? ''
    const slotB = b.bracketSlot ?? ''
    if (slotA && slotB && slotA !== slotB) {
      return String(slotA).localeCompare(String(slotB))
    }
    const idA = a.fixtureId ?? 0
    const idB = b.fixtureId ?? 0
    return String(idA).localeCompare(String(idB), undefined, { numeric: true })
  })
}

/**
 * Latest score from fixture state, then event snapshot.
 * @param {object | undefined} fixture
 * @param {object | undefined} event
 * @returns {{ home: number, away: number }}
 */
export function getLatestScores(fixture, event) {
  const fromFixture = fixture?.score
  const fromEvent = event?.score
  const home =
    fromFixture?.home ?? fromFixture?.homeScore ?? fromEvent?.home ?? 0
  const away =
    fromFixture?.away ?? fromFixture?.awayScore ?? fromEvent?.away ?? 0
  return { home: Number(home) || 0, away: Number(away) || 0 }
}

/**
 * @param {object} fixture
 * @param {{ forceFinished?: boolean }} [opts]
 * @returns {string}
 */
export function formatFixtureScore(fixture, opts = {}) {
  if (!fixture) return ''
  const { homeName, awayName } = getFixtureTeams(fixture)
  const { home, away } = getLatestScores(fixture)
  const state = fixture.state
  const finished =
    opts.forceFinished || fixture.isFinished || state === 'FINISHED'

  let suffix = ''
  if (finished) {
    suffix = ' (FT)'
  } else if (state === 'HALFTIME' || state === 'ET_HALFTIME') {
    suffix = ' (HT)'
  } else if (state === 'PENALTIES') {
    suffix = ' (pens in progress)'
  }

  return `${homeName} ${home} - ${away} ${awayName}${suffix}`
}

/**
 * @param {object[]} fixtures
 * @param {{ forceFinished?: boolean }} [opts]
 * @returns {string}
 */
export function formatRoundScores(fixtures, opts = {}) {
  const sorted = sortFixturesByBracket(fixtures)
  const parts = sorted
    .map((f) => formatFixtureScore(f, opts))
    .filter(Boolean)
  return parts.join(TICKER_SEPARATOR)
}

/**
 * @param {object[]} fixtures
 * @returns {string}
 */
export function formatNextRoundFixtures(fixtures) {
  const sorted = sortFixturesByBracket(fixtures)
  const parts = sorted.map((f) => {
    const { homeName, awayName } = getFixtureTeams(f)
    return `${homeName} vs ${awayName}`
  })
  if (!parts.length) return ''
  return `Next round: ${parts.join(TICKER_SEPARATOR)}`
}

/**
 * @param {object} event
 * @returns {string}
 */
export function getEventType(event) {
  return String(event?.type ?? event?.event_type ?? '').toLowerCase()
}

/**
 * @param {object} event
 * @returns {boolean}
 */
export function isIgnoredShootoutTickerEvent(event) {
  return IGNORED_SHOOTOUT_EVENT_TYPES.has(getEventType(event))
}

/**
 * @param {object | undefined} fixture
 * @returns {boolean}
 */
export function isFixtureInPenaltyShootout(fixture) {
  if (!fixture) return false
  return fixture.state === 'PENALTIES' || fixture.state === 'SHOOTOUT'
}

/**
 * @param {object} event
 * @param {object | undefined} fixture
 * @returns {boolean}
 */
export function isGoalTickerEvent(event, fixture) {
  const type = getEventType(event)
  if (!GOAL_EVENT_TYPES.has(type)) return false
  if (isIgnoredShootoutTickerEvent(event)) return false
  if (type.startsWith('shootout_')) return false
  const chainType = String(
    event?.chain_type ?? event?.chainType ?? event?.metadata?.chain_type ?? '',
  ).toLowerCase()
  if (chainType === 'shootout') return false
  if (isFixtureInPenaltyShootout(fixture)) return false
  return true
}

/**
 * @param {object} event
 * @param {object | undefined} fixture
 * @param {object | undefined} prevFixture
 * @returns {boolean}
 */
export function isPenaltyShootoutStart(event, fixture, prevFixture) {
  const type = getEventType(event)
  if (PENALTY_START_EVENT_TYPES.has(type)) return true
  if (fixture && isFixtureInPenaltyShootout(fixture)) {
    const prevState = prevFixture?.state
    return prevState != null && !isFixtureInPenaltyShootout(prevFixture)
  }
  return false
}

/**
 * @param {object} event
 * @param {object | undefined} fixture
 * @returns {boolean}
 */
export function isHalftimeEvent(event, fixture, prevFixture) {
  const type = getEventType(event)
  if (HALFTIME_EVENT_TYPES.has(type)) return true
  if (fixture?.state === 'HALFTIME' || fixture?.state === 'ET_HALFTIME') {
    const prev = prevFixture?.state
    return prev != null && prev !== 'HALFTIME' && prev !== 'ET_HALFTIME'
  }
  return false
}

/**
 * @param {object | undefined} fixture
 * @param {object | undefined} event
 * @returns {boolean}
 */
export function hasPenaltyShootoutWinner(fixture, event) {
  const { home, away } = getLatestScores(fixture, event)
  if (home !== away) return false
  const pen = fixture?.penaltyScore ?? event?.penaltyScore
  if (!pen) return false
  const h = Number(pen.home ?? 0)
  const a = Number(pen.away ?? 0)
  return h !== a
}

/**
 * @param {object} event
 * @param {object | undefined} fixture
 * @returns {boolean}
 */
export function isShootoutWinnerEvent(event, fixture) {
  const type = getEventType(event)
  if (type === 'shootout_end') return true
  if (type === 'match_winner' || type === 'final_score') {
    return hasPenaltyShootoutWinner(fixture, event)
  }
  if (type === 'match_end' && hasPenaltyShootoutWinner(fixture, event)) {
    return true
  }
  return false
}

/**
 * @param {object} event
 * @param {object | undefined} fixture
 * @returns {boolean}
 */
export function isFulltimeEvent(event, fixture) {
  const type = getEventType(event)
  if (isShootoutWinnerEvent(event, fixture)) return false
  // fulltime = end of 90 minutes; knockout matches may continue to ET — wait for match_end
  if (type === 'fulltime' || type === 'full_time') return false
  if (type === 'match_end' || type === 'final_score') {
    return fixture?.isFinished || fixture?.state === 'FINISHED'
  }
  return false
}

/**
 * @param {object} event
 * @param {object | undefined} fixture
 * @param {object[]} fixtures
 * @returns {string}
 */
export function getTeamNameFromEvent(event, fixture) {
  const { homeTeam, awayTeam } = getFixtureTeams(fixture)
  const { team } = resolveEventTeam(event, { homeTeam, awayTeam })
  const name = getTeamName(team) || getTeamName(event?.team) || getTeamName(event?.teamName)
  if (name) return name
  if (event?.side === 'home') return getFixtureTeams(fixture).homeName
  if (event?.side === 'away') return getFixtureTeams(fixture).awayName
  return ''
}

/**
 * Score line for a single fixture (no status suffixes).
 * @param {object | undefined} fixture
 * @param {object | undefined} event
 * @returns {string}
 */
export function formatMatchScoreLine(fixture, event) {
  const { homeName, awayName } = getFixtureTeams(fixture)
  const { home, away } = getLatestScores(fixture, event)
  return `${homeName} ${home} - ${away} ${awayName}`
}

/**
 * @param {object} event
 * @param {object | undefined} fixture
 * @param {object[]} fixtures
 * @returns {{ goalPart: string, scorePart: string, text: string }}
 */
export function buildGoalTickerMessage(event, fixture, fixtures) {
  const f = fixture || findFixtureById(fixtures, event?.fixtureId)
  const scoringTeam = getTeamNameFromEvent(event, f) || 'Team'
  const scorePart = formatMatchScoreLine(f, event)
  const goalPart = `Goal ${scoringTeam}!`
  return {
    goalPart,
    scorePart,
    text: `${goalPart}${TICKER_GOAL_SCORE_SEPARATOR}${scorePart}`,
  }
}

/**
 * @param {object | undefined} fixture
 * @returns {string}
 */
export function buildPenaltiesStartMessage(fixture) {
  const { homeName, awayName } = getFixtureTeams(fixture)
  return `PENALTIES: ${homeName} vs ${awayName} has gone to penalties`
}

/**
 * @param {object | undefined} fixture
 * @param {object} event
 * @returns {string}
 */
export function getShootoutWinnerName(fixture, event) {
  const { homeTeam, awayTeam, homeName, awayName } = getFixtureTeams(fixture)
  const pen = fixture?.penaltyScore ?? event?.penaltyScore
  const winnerId =
    fixture?.winnerId ?? event?.winnerId ?? event?.winner?.id ?? event?.winner?.teamId

  if (winnerId != null) {
    if (homeTeam?.id != null && String(homeTeam.id) === String(winnerId)) return homeName
    if (awayTeam?.id != null && String(awayTeam.id) === String(winnerId)) return awayName
  }
  if (pen) {
    const h = Number(pen.home ?? 0)
    const a = Number(pen.away ?? 0)
    if (h > a) return homeName
    if (a > h) return awayName
  }
  const { team } = resolveEventTeam(event, { homeTeam, awayTeam })
  return getTeamName(team) || getTeamName(event?.winner) || ''
}

/**
 * @param {object | undefined} fixture
 * @param {object} event
 * @returns {string}
 */
export function buildShootoutWinnerMessage(fixture, event) {
  const winner = getShootoutWinnerName(fixture, event)
  const { homeName, awayName } = getFixtureTeams(fixture)
  const { home, away } = getLatestScores(fixture, event)
  const pen = fixture?.penaltyScore ?? event?.penaltyScore
  const penHome = pen?.home
  const penAway = pen?.away
  const hasPenScore =
    penHome != null &&
    penAway != null &&
    (Number(penHome) > 0 || Number(penAway) > 0)

  if (winner && hasPenScore) {
    return `${winner.toUpperCase()} WIN ON PENALTIES! ${homeName} ${home} - ${away} ${awayName}, pens ${penHome} - ${penAway}`
  }
  if (winner) {
    return `${winner.toUpperCase()} WIN ON PENALTIES!`
  }
  return 'WIN ON PENALTIES!'
}

/**
 * @param {object[]} fixtures
 * @returns {string}
 */
export function buildHalftimeMessage(fixtures) {
  const body = formatRoundScores(fixtures)
  return body ? `HALF-TIME: ${body}` : ''
}

/**
 * @param {object[]} fixtures
 * @returns {string}
 */
export function buildFulltimeMessage(fixtures) {
  const body = formatRoundScores(fixtures, { forceFinished: true })
  return body ? `FULL-TIME: ${body}` : ''
}

/**
 * @param {object[]} fixtures
 * @returns {string}
 */
export function buildRoundCompleteMessage(fixtures) {
  const body = formatRoundScores(fixtures, { forceFinished: true })
  return body ? `ROUND COMPLETE: ${body}` : ''
}

/**
 * @param {object} event
 * @param {object | undefined} fixture
 * @param {object[]} fixtures
 * @param {string} currentRound
 * @returns {{ message: string, dedupeKey: string, priority: number } | null}
 */
export function buildTickerMessageFromEvent(event, fixture, fixtures) {
  const f = fixture || findFixtureById(fixtures, event?.fixtureId)

  if (isIgnoredShootoutTickerEvent(event)) return null

  if (isGoalTickerEvent(event, f)) {
    const built = buildGoalTickerMessage(event, f, fixtures)
    return {
      message: built.text,
      dedupeKey: `goal:${getEventDedupeKey(event)}`,
      priority: TICKER_PRIORITY.HIGH,
    }
  }

  if (isShootoutWinnerEvent(event, f)) {
    return {
      message: buildShootoutWinnerMessage(f, event),
      dedupeKey: `shootout-win:${f?.fixtureId ?? event?.fixtureId}:${getEventDedupeKey(event)}`,
      priority: TICKER_PRIORITY.HIGH,
    }
  }

  if (isPenaltyShootoutStart(event, f)) {
    return {
      message: buildPenaltiesStartMessage(f),
      dedupeKey: `pens:${f?.fixtureId ?? event?.fixtureId}`,
      priority: TICKER_PRIORITY.MEDIUM,
    }
  }

  return null
}

/**
 * @param {object} event
 * @returns {string}
 */
export function getGoalDedupeKey(event) {
  return `goal:${getEventDedupeKey(event)}`
}

/**
 * @param {string|number} fixtureId
 * @returns {string}
 */
export function getPensStartDedupeKey(fixtureId) {
  return `pens:${fixtureId}`
}

/**
 * @param {object} event
 * @param {string|number} fixtureId
 * @returns {string}
 */
export function getShootoutWinnerDedupeKey(event, fixtureId) {
  return `shootout-win:${fixtureId}:${getEventDedupeKey(event)}`
}

/**
 * @param {string} roundKey
 * @returns {string}
 */
export function getHalftimeDedupeKey(roundKey) {
  return `halftime:${roundKey}`
}

/**
 * @param {string} roundKey
 * @returns {string}
 */
export function getFulltimeDedupeKey(roundKey) {
  return `fulltime:${roundKey}`
}

/**
 * @param {string} roundKey
 * @returns {string}
 */
export function getRoundCompleteDedupeKey(roundKey) {
  return `round-complete:${roundKey}`
}

/**
 * @param {string} tournamentId
 * @returns {string}
 */
export function getSeenKeysStorageKey(tournamentId) {
  return `${TICKER_SEEN_KEYS_STORAGE_PREFIX}${tournamentId || 'default'}`
}

/**
 * @param {string} tournamentId
 * @returns {Set<string>}
 */
export function loadSeenTickerKeys(tournamentId) {
  try {
    const raw = sessionStorage.getItem(getSeenKeysStorageKey(tournamentId))
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

/**
 * @param {string} tournamentId
 * @param {Set<string>} keys
 */
export function saveSeenTickerKeys(tournamentId, keys) {
  try {
    const arr = [...keys].slice(-500)
    sessionStorage.setItem(getSeenKeysStorageKey(tournamentId), JSON.stringify(arr))
  } catch {
    /* ignore quota */
  }
}

/**
 * @returns {keyof typeof TICKER_SPEED_CONFIG}
 */
export function loadTickerSpeed() {
  try {
    const v = localStorage.getItem(TICKER_SPEED_STORAGE_KEY)
    if (v && v in TICKER_SPEED_CONFIG) return v
  } catch {
    /* ignore */
  }
  return 'normal'
}

/**
 * @param {keyof typeof TICKER_SPEED_CONFIG} speed
 */
export function saveTickerSpeed(speed) {
  try {
    if (speed in TICKER_SPEED_CONFIG) {
      localStorage.setItem(TICKER_SPEED_STORAGE_KEY, speed)
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {object[]} fixtures
 * @returns {boolean}
 */
export function isRoundFixturesComplete(fixtures) {
  if (!fixtures?.length) return false
  return fixtures.every((f) => f.isFinished || f.state === 'FINISHED')
}

/**
 * Sort temporary messages by priority (lower = higher priority), then insertion order.
 * @param {{ priority: number, insertedAt: number }[]} messages
 */
export function sortTemporaryMessages(messages) {
  return [...messages].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.insertedAt - b.insertedAt
  })
}

/**
 * @param {string} baseText
 * @param {{ text: string }[]} temporaryMessages
 * @returns {string}
 */
export function buildMergedTickerText(baseText, temporaryMessages) {
  const sorted = sortTemporaryMessages(temporaryMessages)
  const prefix = sorted.map((m) => m.text).filter(Boolean)
  if (!prefix.length && !baseText) return ''
  if (!prefix.length) return baseText
  if (!baseText) return prefix.join(TICKER_SEPARATOR)
  return `${prefix.join(TICKER_SEPARATOR)}${TICKER_SEPARATOR}${baseText}`
}
