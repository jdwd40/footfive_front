/**
 * Unified live event shape for SSE + REST recent endpoints + legacy fixture events.
 * @see front_end_integration_guide.md
 */

/** Known live event types, kept for reference and for compatibility with
 *  LEGACY backends that still emit named SSE frames (`event: <type>`), which
 *  EventSource only delivers to listeners registered for that exact name.
 *  Current backends send data-only SSE frames handled by `onmessage`, with
 *  the type read from the JSON payload — so this list is NOT a receive gate:
 *  event types missing from it still reach the frontend and are normalized.
 */
export const LIVE_SSE_EVENT_TYPES = [
  'connected',
  // Match-state lifecycle
  'match_start',
  'kickoff',
  'kickoff_restart',
  'halftime',
  'second_half_start',
  'fulltime',
  'match_end',
  'match_recap',
  'extra_time_start',
  'extra_time_half',
  'extra_time_end',
  // Shootout
  'shootout_start',
  'shootout_goal',
  'shootout_miss',
  'shootout_save',
  'shootout_walkup',
  'shootout_reaction',
  'shootout_end',
  // Goals / shots / chances
  'goal',
  'goal_build_up',
  'chance_created',
  'shot_saved',
  'shot_missed',
  'shot_blocked',
  // Discipline / set pieces
  'corner',
  'foul',
  'yellow_card',
  'red_card',
  // Penalties (in-play and pre-shootout)
  'penalty_awarded',
  'penalty_walkup',
  'penalty_run_up',
  'penalty_scored',
  'penalty_missed',
  'penalty_saved',
  // Tournament lifecycle (mostly filtered out for fixture streams, listed for completeness)
  'round_start',
  'round_complete',
  'state_change',
  'tournament_state',
  'tournament_end',
  // Flow / narration events
  'possession',
  'possession_play',
  'build_up',
  'build_up_play',
  'ball_progression',
  'keeper_distribution',
  'defensive_action',
  'shot',
  'save',
  'miss',
  'block',
  'midfield_battle',
  'attack_breakdown',
  'counter_attack',
  'counter_breakdown',
  'breakaway',
  'final_score',
  'match_winner',
  'match_draw',
  // Commentator analysis (backend CommentaryEngine)
  'match_observation',
]

/**
 * @param {unknown} raw
 * @returns {{ delay_ms: number | null, hold_ms: number | null } | null}
 */
function normalizePacing(raw) {
  if (raw == null || typeof raw !== 'object') return null
  const delay_ms = raw.delay_ms ?? raw.delayMs ?? null
  const hold_ms = raw.hold_ms ?? raw.holdMs ?? null
  if (delay_ms == null && hold_ms == null) return null
  return {
    delay_ms: delay_ms != null ? Number(delay_ms) : null,
    hold_ms: hold_ms != null ? Number(hold_ms) : null,
  }
}

/**
 * @param {unknown} raw - Parsed JSON object or legacy row
 * @param {{ sseType?: string }} [opts]
 * @returns {object | null}
 */
export function normalizeLiveEvent(raw, opts = {}) {
  if (raw == null) return null
  const sseType = opts.sseType
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object') return null

  // The backend wraps the meaningful fields inside `payload` (SSE feed) or
  // `metadata` (REST `/fixtures/:id/events`). Flatten so downstream code can
  // read teamId/homeTeam/awayTeam/displayName/description/score directly.
  const payload =
    parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : null
  const metadata =
    parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : null
  const metadataPacing = metadata?.pacing ?? null
  let data = { ...parsed, ...(payload || {}), ...(metadata || {}) }

  // The REST event shape stores team/player as plain strings rather than
  // {id,name} objects. Lift them onto the canonical name fields.
  if (typeof data.team === 'string') {
    if (!data.teamName) data.teamName = data.team
    data.team = null
  }
  if (typeof data.player === 'string') {
    if (!data.displayName) data.displayName = data.player
    data.player = null
  }

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

  const bundleId = data.bundleId ?? data.bundle_id ?? null
  let bundleStep = null
  if (data.bundleStep !== undefined) bundleStep = data.bundleStep
  else if (data.bundle_step !== undefined) bundleStep = data.bundle_step

  const chain_type = data.chain_type ?? data.chainType ?? null
  const chainType = data.chainType ?? data.chain_type ?? null
  const chain_terminal = data.chain_terminal ?? data.chainTerminal ?? null
  const chainTerminal = data.chainTerminal ?? data.chain_terminal ?? null

  const pacingSource =
    data.pacing != null ? data.pacing : metadataPacing ?? parsed.metadata?.pacing ?? null
  const pacing = normalizePacing(pacingSource)

  // Structured contract fields (backend Improvement #2). side identifies the
  // event's team without description parsing; matchPhase is the match-level
  // phase (first_half, penalty_shootout, ...) — distinct from the chain
  // micro `phase` key, which passes through untouched via the spread.
  const side = data.side === 'home' || data.side === 'away' ? data.side : null
  const matchPhase =
    typeof (data.matchPhase ?? data.match_phase) === 'string'
      ? (data.matchPhase ?? data.match_phase)
      : null

  // Commentary observation fields (match_observation events). Passed
  // through for all types; null when absent so consumers can rely on the
  // keys existing.
  const subtype = typeof data.subtype === 'string' ? data.subtype : null
  const severity = typeof data.severity === 'string' ? data.severity : null

  return {
    ...data,
    type,
    side,
    matchPhase,
    subtype,
    severity,
    bundleId,
    bundleStep,
    chain_type,
    chainType,
    chain_terminal,
    chainTerminal,
    pacing: pacing ?? undefined,
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

/** Event types that may carry an authoritative match score snapshot. */
const MATCH_SCORE_EVENT_TYPES = new Set([
  'goal',
  'penalty_scored',
  'match_end',
  'shootout_end',
])

/** Event types that may carry an authoritative penalty-shootout score snapshot.
 *  New backends stamp a running `penaltyScore` on every shootout event; the
 *  guard in canApplyPenaltyScoreFromEvent no-ops for old events without it. */
const PENALTY_SCORE_EVENT_TYPES = new Set([
  'shootout_goal',
  'shootout_save',
  'shootout_miss',
  'shootout_walkup',
  'shootout_reaction',
  'penalty_scored',
  'match_end',
  'shootout_end',
])

/** Goal toasts fire on paced reveal for these types only. */
export const GOAL_TOAST_EVENT_TYPES = new Set(['goal', 'penalty_scored'])

/** Backend commentator-analysis event (CommentaryEngine). Display-only:
 *  never affects score, clock precedence, penalty score, or the ticker. */
export const OBSERVATION_EVENT_TYPE = 'match_observation'

export function isMatchObservationEvent(event) {
  return (event?.type || event?.event_type || '') === OBSERVATION_EVENT_TYPE
}

/** Short UI chips per observation subtype; fallback label covers unknown
 *  future subtypes so the feed never shows a raw slug. */
export const OBSERVATION_SUBTYPE_LABELS = {
  momentum: 'Momentum',
  pressure: 'Pressure',
  shaky_defence: 'Shaky defence',
  scoreline: 'Scoreline',
  underdog: 'Underdog',
  favourite_control: 'In control',
  late_pressure: 'Late drama',
  comeback: 'Comeback',
  collapse: 'Collapse',
  warning_signs: 'Warning signs',
  game_state: 'Game state',
}

/**
 * Display bundle for a match_observation row: commentator text plus a
 * human subtype chip. Text comes from the backend only — the frontend
 * never invents observations.
 * @param {object} event - normalized live event
 * @returns {{ text: string, subtypeLabel: string } | null}
 */
export function getObservationDisplay(event) {
  if (!isMatchObservationEvent(event)) return null
  const text = event.description || ''
  if (!text) return null
  const subtype = event.subtype || null
  const subtypeLabel =
    (subtype && OBSERVATION_SUBTYPE_LABELS[subtype]) || 'Analysis'
  return { text, subtypeLabel }
}

/**
 * Whether `event.score` should update displayed match score (not type-based increment).
 * @param {object} event
 */
export function canApplyMatchScoreFromEvent(event) {
  return Boolean(event?.score && MATCH_SCORE_EVENT_TYPES.has(event.type))
}

/**
 * Whether `event.penaltyScore` should update displayed shootout score.
 * @param {object} event
 */
export function canApplyPenaltyScoreFromEvent(event) {
  return Boolean(event?.penaltyScore && PENALTY_SCORE_EVENT_TYPES.has(event.type))
}

/** Flow events where title + subtitle should name the same possessing/attacking team. */
export const POSSESSION_FLOW_EVENT_TYPES = new Set([
  'possession',
  'possession_play',
  'build_up',
  'build_up_play',
  'buildup',
  'ball_progression',
  'ball_progress',
  'progression',
  'goal_build_up',
  'midfield_battle',
  'keeper_distribution',
  'attacking_play',
  'attack',
  'attack_phase',
])

/** Events where a defending opponent may appear in copy. */
export const BREAKDOWN_EVENT_TYPES = new Set(['attack_breakdown', 'counter_breakdown'])

/** Backend teamId is the defending side; possession belongs to the opponent. */
export const DEFENSIVE_STAND_EVENT_TYPES = BREAKDOWN_EVENT_TYPES

/** Event types where the UI should show who has (or just had) the ball. */
export const POSSESSION_INDICATOR_EVENT_TYPES = new Set([
  ...POSSESSION_FLOW_EVENT_TYPES,
  'counter_attack',
  'breakaway',
  'chance_created',
  'big_chance',
  ...BREAKDOWN_EVENT_TYPES,
])

function teamNameAppearsInText(name, text) {
  if (!name || !text) return false
  if (text.includes(name)) return true
  const token = name.split(/\s+/)[0]
  return token.length >= 3 && text.includes(token)
}

/**
 * @param {string | null | undefined} text
 * @param {string | null | undefined} homeName
 * @param {string | null | undefined} awayName
 * @returns {'home' | 'away' | null}
 */
export function findTeamSideInText(text, homeName, awayName) {
  if (!text) return null
  const homeHit = teamNameAppearsInText(homeName, text)
  const awayHit = teamNameAppearsInText(awayName, text)
  if (homeHit && !awayHit) return 'home'
  if (awayHit && !homeHit) return 'away'
  return null
}

/**
 * Resolve which team an event belongs to using context home/away teams.
 *
 * Tries, in order: explicit team name → teamId match → event.side → fallback null.
 *
 * @param {object} event - Normalized live event
 * @param {object} [ctx]
 * @param {{id?: any, name?: string} | null} [ctx.homeTeam]
 * @param {{id?: any, name?: string} | null} [ctx.awayTeam]
 * @returns {{ team: {id?: any, name?: string} | null, side: 'home' | 'away' | null }}
 */
export function resolveEventTeam(event, ctx = {}) {
  if (!event) return { team: null, side: null }

  const toTeamObj = (raw, fallbackId) => {
    if (raw == null) return null
    if (typeof raw === 'string') {
      return { name: raw, id: fallbackId ?? null }
    }
    if (typeof raw === 'object') {
      if (fallbackId != null && raw.id == null) return { ...raw, id: fallbackId }
      return raw
    }
    return null
  }

  const home = toTeamObj(
    ctx.homeTeam ?? event.homeTeam ?? event.home_team ?? null,
    ctx.homeTeamId ?? null,
  )
  const away = toTeamObj(
    ctx.awayTeam ?? event.awayTeam ?? event.away_team ?? null,
    ctx.awayTeamId ?? null,
  )

  const teamId = event.teamId ?? event.team_id ?? event.team?.id ?? null

  const directName =
    event.team?.name || event.teamName || event.team_name || null
  if (directName) {
    if (home?.name && directName === home.name) return { team: home, side: 'home' }
    if (away?.name && directName === away.name) return { team: away, side: 'away' }
    return { team: { name: directName, id: event.team?.id ?? teamId ?? null }, side: null }
  }

  if (teamId != null) {
    if (home?.id != null && String(home.id) === String(teamId)) {
      return { team: home, side: 'home' }
    }
    if (away?.id != null && String(away.id) === String(teamId)) {
      return { team: away, side: 'away' }
    }
  }

  const side = event.side === 'home' || event.side === 'away' ? event.side : null
  if (side === 'home' && home) return { team: home, side: 'home' }
  if (side === 'away' && away) return { team: away, side: 'away' }

  return { team: null, side: null }
}

/**
 * Opponent of the resolved event team within the match.
 * @param {object} event
 * @param {object} ctx
 * @param {{ team: object | null, side: 'home' | 'away' | null }} [resolved]
 */
export function resolveOpponentTeam(event, ctx = {}, resolved = null) {
  const { team, side } = resolved || resolveEventTeam(event, ctx)
  const toTeamObj = (raw, fallbackId) => {
    if (raw == null) return null
    if (typeof raw === 'string') return { name: raw, id: fallbackId ?? null }
    if (typeof raw === 'object') {
      if (fallbackId != null && raw.id == null) return { ...raw, id: fallbackId }
      return raw
    }
    return null
  }
  const home = toTeamObj(ctx.homeTeam ?? event?.homeTeam ?? event?.home_team ?? null, ctx.homeTeamId)
  const away = toTeamObj(ctx.awayTeam ?? event?.awayTeam ?? event?.away_team ?? null, ctx.awayTeamId)

  if (side === 'home' && away) return { team: away, side: 'away' }
  if (side === 'away' && home) return { team: home, side: 'home' }
  if (team?.name && home?.name && team.name === home.name && away) {
    return { team: away, side: 'away' }
  }
  if (team?.name && away?.name && team.name === away.name && home) {
    return { team: home, side: 'home' }
  }
  return { team: null, side: null }
}

/**
 * Prefer backend description's named team for flow events when it disagrees with id/side resolution.
 */
/**
 * Match a name fragment from backend copy to home/away (handles abbreviations).
 * @returns {{ team: object, side: 'home' | 'away' } | null}
 */
export function matchTeamByNameFragment(fragment, home, away) {
  if (!fragment) return null
  const frag = fragment.trim().toLowerCase()
  const candidates = [
    { team: home, side: 'home' },
    { team: away, side: 'away' },
  ].filter((c) => c.team?.name)

  for (const { team, side } of candidates) {
    const full = team.name.toLowerCase()
    const token = full.split(/\s+/)[0]
    if (full === frag || full.startsWith(frag) || frag.startsWith(token) || token === frag) {
      return { team, side }
    }
  }
  return null
}

/**
 * Parse attack_breakdown description: "{defender} shut down {attacker}'s attack".
 */
export function parseAttackBreakdownDescription(description) {
  if (!description) return null
  const m = description.match(/^(.+?)\s+shut\s+down\s+(.+?)(?:'s|’s)\s+attack/i)
  if (!m) return null
  return { defendingName: m[1].trim(), attackingName: m[2].trim() }
}

/**
 * Parse counter_breakdown description: "{defender} recover and snuff out the counter".
 */
export function parseCounterBreakdownDescription(description) {
  if (!description) return null
  const m = description.match(/^(.+?)\s+recover\s+and\s+snuff\s+out\s+(?:the\s+)?counter/i)
  if (!m) return null
  return { defendingName: m[1].trim() }
}

/**
 * Breakdown events: teamId = defending team; possession = attacking/counter side.
 * @returns {{
 *   possessionTeam: object | null,
 *   possessionSide: 'home' | 'away' | null,
 *   defendingTeam: object | null,
 *   defendingSide: 'home' | 'away' | null,
 * }}
 */
export function resolveBreakdownParties(event, ctx = {}, description = null) {
  const kind = event?.type || event?.event_type || ''
  const desc = description ?? event?.description ?? null
  const toTeamObj = (raw, fallbackId) => {
    if (raw == null) return null
    if (typeof raw === 'string') return { name: raw, id: fallbackId ?? null }
    if (typeof raw === 'object') {
      if (fallbackId != null && raw.id == null) return { ...raw, id: fallbackId }
      return raw
    }
    return null
  }
  const home = toTeamObj(
    ctx.homeTeam ?? event?.homeTeam ?? event?.home_team ?? null,
    ctx.homeTeamId ?? null,
  )
  const away = toTeamObj(
    ctx.awayTeam ?? event?.awayTeam ?? event?.away_team ?? null,
    ctx.awayTeamId ?? null,
  )

  const defendingResolved = resolveEventTeam(event, ctx)
  const attackingResolved = resolveOpponentTeam(event, ctx, defendingResolved)

  // Structured side (backend Improvement #2): on breakdown events, teamId and
  // side identify the DEFENDING team. When present and both teams are known,
  // derive the parties directly and skip the description regexes below —
  // those remain only as fallback for old events without `side`.
  if (event?.side === 'home' || event?.side === 'away') {
    const defending = event.side === 'home' ? home : away
    const possession = event.side === 'home' ? away : home
    if (defending?.name && possession?.name) {
      return {
        possessionTeam: possession,
        possessionSide: event.side === 'home' ? 'away' : 'home',
        defendingTeam: defending,
        defendingSide: event.side,
      }
    }
  }

  if (kind === 'attack_breakdown') {
    const parsed = parseAttackBreakdownDescription(desc)
    if (parsed) {
      const defending = matchTeamByNameFragment(parsed.defendingName, home, away)
      const possession = matchTeamByNameFragment(parsed.attackingName, home, away)
      if (defending && possession) {
        return {
          possessionTeam: possession.team,
          possessionSide: possession.side,
          defendingTeam: defending.team,
          defendingSide: defending.side,
        }
      }
    }
  }

  if (kind === 'counter_breakdown') {
    const parsed = parseCounterBreakdownDescription(desc)
    if (parsed) {
      const defending = matchTeamByNameFragment(parsed.defendingName, home, away)
      if (defending) {
        const possession =
          defending.side === 'home'
            ? away
              ? { team: away, side: 'away' }
              : null
            : home
              ? { team: home, side: 'home' }
              : null
        if (possession) {
          return {
            possessionTeam: possession.team,
            possessionSide: possession.side,
            defendingTeam: defending.team,
            defendingSide: defending.side,
          }
        }
      }
    }
  }

  return {
    possessionTeam: attackingResolved.team,
    possessionSide: attackingResolved.side,
    defendingTeam: defendingResolved.team,
    defendingSide: defendingResolved.side,
  }
}

/**
 * Unified display resolution: possession team + opponent for feed rendering.
 */
export function resolveEventDisplayTeams(event, ctx = {}, description = null) {
  const kind = event?.type || event?.event_type || ''
  const desc = description ?? event?.description ?? null

  if (BREAKDOWN_EVENT_TYPES.has(kind)) {
    const parties = resolveBreakdownParties(event, ctx, desc)
    return {
      possession: {
        team: parties.possessionTeam,
        side: parties.possessionSide,
      },
      opponent: {
        team: parties.defendingTeam,
        side: parties.defendingSide,
      },
      isBreakdown: true,
    }
  }

  const possession = reconcileEventTeamWithDescription(event, ctx, desc)
  const opponent = resolveOpponentTeam(event, ctx, possession)
  return { possession, opponent, isBreakdown: false }
}

export function reconcileEventTeamWithDescription(event, ctx, description) {
  const resolved = resolveEventTeam(event, ctx)

  // Structured side from the backend is authoritative: skip the
  // description-text override entirely. Only trusted when it actually
  // resolved to a known team, so a side field without matching team data
  // still falls back to the legacy description path below (needed for old
  // persisted events and old backend deployments).
  if ((event?.side === 'home' || event?.side === 'away') && resolved.team) {
    return resolved
  }

  if (!description) return resolved

  const homeName =
    typeof ctx.homeTeam === 'string' ? ctx.homeTeam : ctx.homeTeam?.name ?? event?.homeTeam?.name
  const awayName =
    typeof ctx.awayTeam === 'string' ? ctx.awayTeam : ctx.awayTeam?.name ?? event?.awayTeam?.name
  const descSide = findTeamSideInText(description, homeName, awayName)
  if (!descSide) return resolved

  const kind = event?.type || event?.event_type || ''
  const flowEvent = POSSESSION_FLOW_EVENT_TYPES.has(kind)
  if (!flowEvent) return resolved

  const teamLabel = resolved.team?.name
  const descTeamName = descSide === 'home' ? homeName : awayName
  if (teamLabel && descTeamName && teamLabel !== descTeamName) {
    const home = ctx.homeTeam ?? event?.homeTeam
    const away = ctx.awayTeam ?? event?.awayTeam
    const toTeamObj = (raw, fallbackId) => {
      if (raw == null) return null
      if (typeof raw === 'string') return { name: raw, id: fallbackId ?? null }
      return typeof raw === 'object' ? raw : null
    }
    const teamObj = descSide === 'home' ? toTeamObj(home, ctx.homeTeamId) : toTeamObj(away, ctx.awayTeamId)
    if (teamObj?.name) return { team: teamObj, side: descSide }
  }

  return resolved
}

/** Backend phrasing that mislabels the defending action (attack vs defence). */
export function isMisleadingBreakdownDescription(description) {
  if (!description) return false
  return /shut down by .+'s attack/i.test(description)
}

/**
 * @param {string | null | undefined} teamLabel
 * @param {string | null | undefined} opponentLabel
 */
export function buildBreakdownSubtitle(possessionLabel, defendingLabel, kind) {
  if (!possessionLabel || !defendingLabel) {
    if (possessionLabel && kind === 'attack_breakdown') return `${possessionLabel} lose the ball`
    if (possessionLabel && kind === 'counter_breakdown') return `${possessionLabel}'s counter breaks down`
    return null
  }
  if (kind === 'counter_breakdown') {
    return `${defendingLabel} recover and snuff out ${possessionLabel}'s counter`
  }
  return `${defendingLabel} shut down ${possessionLabel}'s attack`
}

/**
 * Latest authoritative scores from a newest-first event list (paced feed / bootstrap).
 * @param {object[]} events
 * @param {{ home: number, away: number } | null | undefined} [fallbackScore]
 * @param {{ home: number, away: number } | null | undefined} [fallbackPenaltyScore]
 */
/**
 * Latest match clock from a visible event list (newest-first or any order).
 * @param {object[]} events
 * @returns {{ minute: number, second: number }}
 */
export function getLatestClockFromEvents(events) {
  if (!events?.length) return { minute: 0, second: 0 }

  let latest = events[0]
  for (const event of events) {
    const m = Number(event.minute) || 0
    const lm = Number(latest.minute) || 0
    const s = Number(event.second) || 0
    const ls = Number(latest.second) || 0
    if (m > lm || (m === lm && s > ls)) latest = event
  }

  return {
    minute: Number(latest.minute) || 0,
    second: Number(latest.second) || 0,
  }
}

/**
 * Latest match-level phase from a visible event list (any order).
 * Events without a matchPhase (old backend / old persisted rows) are
 * ignored, so mixed lists degrade gracefully.
 * @param {object[]} events
 * @returns {string | null}
 */
export function getLatestMatchPhaseFromEvents(events) {
  if (!events?.length) return null
  let latest = null
  for (const event of events) {
    if (typeof event?.matchPhase !== 'string' || !event.matchPhase) continue
    // compareLiveEventsDesc sorts newest first: negative means `event` is
    // newer than the current latest.
    if (latest == null || compareLiveEventsDesc(event, latest) < 0) {
      latest = event
    }
  }
  return latest ? latest.matchPhase : null
}

export function getDisplayScoresFromEvents(events, fallbackScore, fallbackPenaltyScore) {
  let score = null
  let penaltyScore = null

  // Newest-first: first scoring event in the list is the latest authoritative snapshot.
  for (const e of events || []) {
    if (!score && canApplyMatchScoreFromEvent(e)) score = e.score
    if (!penaltyScore && canApplyPenaltyScoreFromEvent(e)) penaltyScore = e.penaltyScore
    if (score && penaltyScore) break
  }

  return {
    score: score ?? fallbackScore ?? null,
    penaltyScore: penaltyScore ?? fallbackPenaltyScore ?? null,
  }
}
