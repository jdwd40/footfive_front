/**
 * Unified live event shape for SSE + REST recent endpoints + legacy fixture events.
 * @see front_end_integration_guide.md
 */

/** SSE named events the backend may emit (non-exhaustive; unknown types still normalized). */
export const LIVE_SSE_EVENT_TYPES = [
  'connected',
  'goal',
  'penalty_scored',
  'match_start',
  'halftime',
  'second_half_start',
  'fulltime',
  'match_end',
  'extra_time_start',
  'extra_time_half',
  'extra_time_end',
  'shootout_start',
  'shootout_goal',
  'shootout_miss',
  'shootout_save',
  'shootout_end',
  'yellow_card',
  'red_card',
  'round_start',
  'round_complete',
  'state_change',
  'tournament_state',
  'tournament_end',
]

/**
 * @param {unknown} raw - Parsed JSON object or legacy row
 * @param {{ sseType?: string }} [opts]
 * @returns {object | null}
 */
export function normalizeLiveEvent(raw, opts = {}) {
  if (raw == null) return null
  const sseType = opts.sseType
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null

  const legacyType = data.event_type || data.eventType
  const type =
    sseType ||
    data.type ||
    legacyType ||
    (data.clientId != null && data.seq != null ? 'connected' : null)

  if (!type) return null

  const seq =
    data.seq != null
      ? Number(data.seq)
      : data.event_id != null
        ? Number(data.event_id)
        : data.eventId != null
          ? Number(data.eventId)
          : data.id != null
            ? Number(data.id)
            : 0

  const fixtureId =
    data.fixtureId != null
      ? data.fixtureId
      : data.fixture_id != null
        ? data.fixture_id
        : null

  const minute = data.minute != null ? Number(data.minute) : null
  const second = data.second != null ? Number(data.second) : null

  const homeTeam = data.homeTeam || data.home_team
  const awayTeam = data.awayTeam || data.away_team

  const displayName =
    data.displayName ||
    data.player_name ||
    data.playerName ||
    (data.player?.name ?? null)

  const assistName =
    data.assistName ||
    data.assist_name ||
    (data.assist?.name ?? null)

  const teamName =
    data.team?.name ||
    data.teamName ||
    data.team_name ||
    null

  const description = data.description ?? null

  return {
    ...data,
    type,
    seq: Number.isFinite(seq) ? seq : 0,
    fixtureId,
    tournamentId: data.tournamentId ?? data.tournament_id ?? null,
    minute: Number.isFinite(minute) ? minute : null,
    second: Number.isFinite(second) ? second : 0,
    score: data.score ?? null,
    penaltyScore: data.penaltyScore ?? data.penalty_score ?? null,
    shootoutScore: data.shootoutScore ?? data.shootout_score ?? null,
    teamId: data.teamId ?? data.team_id ?? null,
    homeTeam,
    awayTeam,
    displayName,
    assistName,
    teamName,
    description,
    serverTimestamp: data.serverTimestamp ?? data.server_timestamp ?? null,
    xg: data.xg ?? null,
    round: data.round ?? data.roundName ?? data.round_name ?? null,
  }
}

/**
 * @param {unknown[]} events
 * @returns {object[]}
 */
export function normalizeLiveEventsList(events) {
  if (!Array.isArray(events)) return []
  return events
    .map((e) => normalizeLiveEvent(e))
    .filter(Boolean)
}

/** Sort newest-first for feeds: seq desc, then minute, then second. */
export function compareLiveEventsDesc(a, b) {
  const sa = Number(a.seq) || 0
  const sb = Number(b.seq) || 0
  if (sb !== sa) return sb - sa
  const ma = Number(a.minute) || 0
  const mb = Number(b.minute) || 0
  if (mb !== ma) return mb - ma
  const seca = Number(a.second) || 0
  const secb = Number(b.second) || 0
  return secb - seca
}

export function sortLiveEventsDesc(events) {
  return [...(events || [])].sort(compareLiveEventsDesc)
}

/**
 * Dedupe by seq when seq > 0; otherwise keep index order uniqueness weakly by JSON stringify.
 * @param {object[]} events
 * @returns {object[]}
 */
export function dedupeLiveEventsBySeq(events) {
  const seen = new Set()
  const out = []
  for (const e of events || []) {
    const s = Number(e.seq)
    const key = s > 0 ? `seq:${s}` : `n:${e.type}:${e.minute}:${e.second}:${e.fixtureId}:${e.description}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

export function mergeAndDedupeEvents(existing, incoming) {
  return dedupeLiveEventsBySeq([...(existing || []), ...(incoming || [])])
}
