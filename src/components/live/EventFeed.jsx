import { useRef, useEffect, useMemo } from 'react'
import { getEventIcon, formatMatchTime } from '../../utils/formatters'
import {
  compareLiveEventsDesc,
  resolveEventDisplayTeams,
  POSSESSION_FLOW_EVENT_TYPES,
  BREAKDOWN_EVENT_TYPES,
  POSSESSION_INDICATOR_EVENT_TYPES,
  buildBreakdownSubtitle,
  isMatchObservationEvent,
  getObservationDisplay,
} from '../../utils/liveEventModel'

/** Resolve event kind for display (unified `type` or legacy `event_type`). */
function eventKind(event) {
  return event?.type || event?.event_type || event?.eventType || ''
}

export default function EventFeed({
  events,
  homeTeam,
  awayTeam,
  autoScroll = true,
  /** Taller scroll area on xl+ (live match detail side panel). */
  desktopTall = false,
  /** 'home' | 'away' names or team objects with .name */
  homeTeamName: homeTeamNameProp,
  awayTeamName: awayTeamNameProp,
  /** Optional ids for callers that pass team name + id separately */
  homeTeamId,
  awayTeamId,
}) {
  const feedRef = useRef(null)

  const homeName =
    homeTeamNameProp ||
    (typeof homeTeam === 'string' ? homeTeam : homeTeam?.name) ||
    ''
  const awayName =
    awayTeamNameProp ||
    (typeof awayTeam === 'string' ? awayTeam : awayTeam?.name) ||
    ''

  const homeId =
    homeTeamId ?? (typeof homeTeam === 'object' ? homeTeam?.id : undefined) ?? null
  const awayId =
    awayTeamId ?? (typeof awayTeam === 'object' ? awayTeam?.id : undefined) ?? null

  const homeTeamObj =
    typeof homeTeam === 'object' && homeTeam !== null
      ? { ...homeTeam, id: homeTeam.id ?? homeId }
      : homeName
        ? { name: homeName, id: homeId }
        : null
  const awayTeamObj =
    typeof awayTeam === 'object' && awayTeam !== null
      ? { ...awayTeam, id: awayTeam.id ?? awayId }
      : awayName
        ? { name: awayName, id: awayId }
        : null

  const sortedEvents = useMemo(() => {
    if (!events || events.length === 0) return []
    return [...events].sort(compareLiveEventsDesc)
  }, [events])

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = 0
    }
  }, [sortedEvents, autoScroll])

  if (!sortedEvents.length) {
    return (
      <div className="flex items-center justify-center h-40 text-text-muted">
        <div className="text-center">
          <span className="text-3xl block mb-2">⏳</span>
          <p>Waiting for events...</p>
        </div>
      </div>
    )
  }

  const scrollHeightClass = desktopTall ? 'max-h-96 xl:max-h-[70vh] xl:min-h-[280px]' : 'max-h-96'

  return (
    <div
      ref={feedRef}
      className={`space-y-2 overflow-y-auto pr-2 scroll-smooth min-h-0 ${scrollHeightClass}`}
    >
      {sortedEvents.map((event, index) => (
        <EventItem
          key={event.seq > 0 ? `seq-${event.seq}` : `idx-${index}-${eventKind(event)}`}
          event={event}
          homeTeam={homeTeamObj}
          awayTeam={awayTeamObj}
          isLatest={index === 0}
        />
      ))}
    </div>
  )
}

function EventItem({ event, homeTeam, awayTeam, isLatest }) {
  const kind = eventKind(event)

  // Commentator analysis rows render quote-style: backend-provided text,
  // subtype chip, no team headline/possession chrome so they read as
  // punditry rather than a match incident.
  if (isMatchObservationEvent(event)) {
    return <ObservationItem event={event} isLatest={isLatest} />
  }

  const teamCtx = { homeTeam, awayTeam }
  const rawDescription = event.description || null
  const { possession, opponent, isBreakdown } = resolveEventDisplayTeams(
    event,
    teamCtx,
    rawDescription,
  )
  const teamLabel = possession.team?.name || null
  const opponentLabel = opponent.team?.name || null
  const isHomeTeam = possession.side === 'home'
  const isMatchStateEvent = NEUTRAL_EVENT_TEMPLATES[kind] != null
  const isNeutral = !teamLabel || isMatchStateEvent
  const showPossessionIndicator = teamLabel && POSSESSION_INDICATOR_EVENT_TYPES.has(kind)

  const playerName =
    event.displayName || event.player_name || event.player?.name || null
  const assistName =
    event.assistName || event.assist_name || event.assist?.name || null

  const descriptionNamesTeam = (text, name) => {
    if (!text || !name) return false
    if (text.includes(name)) return true
    const token = name.split(/\s+/)[0]
    return token.length >= 3 && text.includes(token)
  }

  const useDescriptionAsHeadline =
    rawDescription &&
    POSSESSION_FLOW_EVENT_TYPES.has(kind) &&
    teamLabel &&
    descriptionNamesTeam(rawDescription, teamLabel) &&
    !BREAKDOWN_EVENT_TYPES.has(kind)

  let description = null
  if (BREAKDOWN_EVENT_TYPES.has(kind)) {
    description =
      sanitizeEventDescription(rawDescription, { teamName: teamLabel, playerName }) ||
      buildBreakdownSubtitle(teamLabel, opponentLabel, kind)
  } else if (!useDescriptionAsHeadline) {
    description = sanitizeEventDescription(rawDescription, {
      teamName: teamLabel,
      playerName,
    })
    if (
      description &&
      teamLabel &&
      POSSESSION_FLOW_EVENT_TYPES.has(kind) &&
      !descriptionNamesTeam(description, teamLabel)
    ) {
      description = null
    }
  }

  const possessionIndicatorLabel = isBreakdown
    ? kind === 'counter_breakdown'
      ? 'Counter'
      : 'Lost ball'
    : 'In possession'

  const isGoal =
    kind === 'goal' ||
    kind === 'penalty_goal' ||
    kind === 'penalty_scored' ||
    kind === 'shootout_goal' ||
    kind === 'shootout_end'
  const isPenaltyAwarded = kind === 'penalty_awarded'
  const isImportant =
    kind === 'red_card' ||
    kind === 'yellow_card' ||
    kind === 'shot_saved' ||
    kind === 'shot_missed' ||
    kind === 'shot_blocked' ||
    kind === 'penalty_saved' ||
    kind === 'penalty_missed' ||
    kind === 'shootout_save' ||
    kind === 'shootout_miss' ||
    kind === 'counter_attack'
  const isTension =
    kind === 'penalty_walkup' ||
    kind === 'penalty_run_up' ||
    kind === 'shootout_walkup'
  const isShootoutReaction = kind === 'shootout_reaction'

  const surfaceStyle = isGoal
    ? 'bg-primary/15 border border-primary/40 shadow-lg shadow-primary/20'
    : isPenaltyAwarded
      ? 'bg-amber-500/12 border border-amber-500/35'
      : isImportant
        ? 'bg-yellow-500/10 border border-yellow-500/30'
        : isTension
          ? 'bg-orange-500/5 border border-orange-400/25'
          : isShootoutReaction
            ? 'bg-violet-500/8 border border-violet-400/25'
            : 'bg-card hover:bg-card-hover'

  const minute = event.minute != null ? event.minute : 0
  const second = event.second != null ? event.second : 0

  return (
    <div
      className={`
        flex items-center gap-3 rounded-xl transition-all duration-300
        ${isShootoutReaction ? 'p-2' : 'p-3'}
        ${isLatest ? 'animate-slide-up' : ''}
        ${surfaceStyle}
        ${isTension ? 'animate-[pulse_3s_ease-in-out_infinite]' : ''}
        ${isNeutral ? '' : isHomeTeam ? 'border-l-4 border-l-primary' : teamLabel ? 'border-r-4 border-r-blue-500' : ''}
      `}
    >
      <div className="min-w-[56px] text-center">
        <span
          className={`
          text-sm font-mono font-bold
          ${isGoal ? 'text-primary' : 'text-text-muted'}
        `}
        >
          {formatMatchTime(minute, second)}
        </span>
        {event.seq > 0 && (
          <span className="block text-[10px] text-text-muted/70 font-mono">#{event.seq}</span>
        )}
      </div>

      <div
        className={`
        rounded-full flex items-center justify-center
        ${isShootoutReaction ? 'w-8 h-8 text-lg' : 'w-10 h-10 text-xl'}
        ${isGoal ? 'bg-primary/30 animate-pulse' : isTension ? 'bg-orange-500/15' : isShootoutReaction ? 'bg-violet-500/15' : 'bg-card-hover'}
      `}
      >
        {getEventIcon(kind)}
      </div>

      <div className="flex-1 min-w-0">
        {showPossessionIndicator && (
          <div className="mb-1.5">
            <span
              className={`
                inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide
                ${isHomeTeam ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}
              `}
            >
              <span aria-hidden>⚽</span>
              <span>{possessionIndicatorLabel}</span>
              <span className="normal-case tracking-normal">·</span>
              <span className="normal-case tracking-normal">{teamLabel}</span>
            </span>
          </div>
        )}
        <p
          className={`font-semibold ${
            isGoal
              ? 'text-primary text-lg'
              : isShootoutReaction
                ? 'text-sm text-violet-200'
                : isTension
                  ? 'text-text italic'
                  : isPenaltyAwarded
                    ? 'text-amber-200'
                    : 'text-text'
          }`}
        >
          {useDescriptionAsHeadline ? (
            <span>
              {sanitizeEventDescription(rawDescription, { teamName: teamLabel, playerName }) ||
                rawDescription}
            </span>
          ) : (
            (() => {
              const { pre, team, post } = formatEventHeadline(kind, teamLabel)
              const teamColor = isHomeTeam ? 'text-primary' : 'text-blue-400'
              return (
                <>
                  {pre}
                  {team && <span className={teamColor}>{team}</span>}
                  {post}
                </>
              )
            })()
          )}
        </p>
        {description && (
          <p className="text-sm text-text-muted line-clamp-2">{description}</p>
        )}
        {playerName && (
          <p className="text-sm text-text-muted truncate">{playerName}</p>
        )}
        {assistName && (
          <p className="text-xs text-text-muted">Assist: {assistName}</p>
        )}
        {event.shootoutScore && (
          <p className="text-xs text-text-muted mt-1">
            Pens: {event.shootoutScore.home}-{event.shootoutScore.away}
          </p>
        )}
      </div>

      {event.score && (
        <div className="text-sm font-mono text-text-muted shrink-0">
          {event.score.home}-{event.score.away}
        </div>
      )}

      {isGoal && <div className="text-2xl animate-bounce shrink-0">🎉</div>}
    </div>
  )
}

function ObservationItem({ event, isLatest }) {
  const display = getObservationDisplay(event)
  if (!display) return null
  const minute = event.minute != null ? event.minute : 0
  const second = event.second != null ? event.second : 0

  return (
    <div
      className={`
        flex items-center gap-3 rounded-xl transition-all duration-300 p-2.5
        bg-sky-500/8 border border-sky-400/20
        ${isLatest ? 'animate-slide-up' : ''}
      `}
    >
      <div className="min-w-[56px] text-center">
        <span className="text-sm font-mono font-bold text-text-muted">
          {formatMatchTime(minute, second)}
        </span>
        {event.seq > 0 && (
          <span className="block text-[10px] text-text-muted/70 font-mono">#{event.seq}</span>
        )}
      </div>

      <div className="w-8 h-8 text-lg rounded-full flex items-center justify-center bg-sky-500/15">
        {getEventIcon('match_observation')}
      </div>

      <div className="flex-1 min-w-0">
        <div className="mb-1">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-sky-500/15 text-sky-300 border border-sky-400/25">
            <span>Commentary</span>
            <span className="normal-case tracking-normal">·</span>
            <span className="normal-case tracking-normal">{display.subtypeLabel}</span>
          </span>
        </div>
        <p className="text-sm text-sky-100/90 italic">{display.text}</p>
      </div>
    </div>
  )
}

function sanitizeEventDescription(description, { teamName, playerName } = {}) {
  if (!description) return null
  let cleaned = description
  if (teamName) {
    cleaned = cleaned.replace(/Unknown Team/gi, teamName)
  }
  if (playerName) {
    cleaned = cleaned.replace(/Unknown Player/gi, playerName)
  }
  return cleaned
}

// Match-state events that aren't tied to one team.
const NEUTRAL_EVENT_TEMPLATES = {
  match_start: 'Kick Off',
  kickoff: 'Kick Off',
  halftime: 'Half Time',
  second_half_start: 'Second Half',
  fulltime: 'Full Time (90)',
  extra_time_start: 'Extra Time',
  extra_time_half: 'ET Half Time',
  extra_time_end: 'Extra Time End',
  shootout_start: 'Shootout Begins',
  shootout_end: 'Shootout decided',
  kickoff_restart: 'Play Resumes',
  match_end: 'Match Over',
  connected: 'Connected',
  var_check: 'VAR Review',
  final_score: 'Final Score',
  match_draw: 'Match Drawn',
}

// Team-affiliated events. `{team}` is replaced with the resolved team name.
const TEAM_EVENT_TEMPLATES = {
  goal: '{team} GOAL!!!',
  penalty_scored: 'PENALTY — {team} score!',
  penalty_goal: 'PENALTY — {team} score!',
  shootout_goal: '{team} bury it in the shootout!',
  shootout_miss: 'MISS — {team} in the shootout',
  shootout_save: 'SAVED — {team} denied in the shootout',
  shot: '{team} take a shot',
  shot_attempt: '{team} take a shot',
  shot_saved: '{team}’s shot saved',
  shot_missed: '{team}’s shot off target',
  shot_off: '{team}’s shot off target',
  shot_blocked: '{team}’s shot blocked',
  save: '{team} make a save',
  miss: '{team} off target',
  block: '{team} block the shot',
  attack: '{team} push forward',
  attacking_play: '{team} push forward',
  attack_phase: '{team} push forward',
  counter_attack: '{team} break on the counter',
  breakaway: '{team} break away',
  build_up: '{team} build up play',
  build_up_play: '{team} build up play',
  buildup: '{team} build up play',
  possession: '{team} have possession',
  possession_play: '{team} have possession',
  ball_progression: '{team} push the ball forward',
  ball_progress: '{team} push the ball forward',
  progression: '{team} push the ball forward',
  chance_created: 'Chance for {team}!',
  big_chance: 'Big chance for {team}!',
  defensive_play: '{team} defending',
  defending: '{team} defending',
  defensive_action: '{team} defending',
  keeper_distribution: '{team} keeper plays it out',
  pressing: '{team} press high',
  tackle: 'Tackle by {team}',
  interception: '{team} intercept',
  header: '{team} header',
  corner: 'Corner kick to {team}',
  corner_kick: 'Corner kick to {team}',
  free_kick: 'Free kick to {team}',
  throw_in: 'Throw-in to {team}',
  foul: 'Foul by {team}',
  yellow_card: 'Yellow card — {team}',
  red_card: 'RED CARD — {team}',
  offside: 'Offside against {team}',
  substitution: '{team} substitution',
  penalty_awarded: 'PENALTY awarded to {team}!',
  penalty_saved: 'SAVED! {team}’s penalty stopped',
  penalty_missed: 'MISS! {team}’s penalty off target',
  midfield_battle: 'Midfield battle — {team}',
  goal_build_up: '{team} build the attack',
  attack_breakdown: '{team} lose the ball',
  counter_breakdown: '{team} counter breaks down',
  penalty_walkup: '{team} walk to the spot…',
  penalty_run_up: '{team} at the run-up…',
  shootout_walkup: '{team} step up in the shootout…',
  shootout_reaction: '{team} react',
  injury: 'Injury — {team}',
  match_winner: '{team} win the match',
}

/**
 * Build a headline for an event row.
 * Returns { pre, team, post } so the caller can colour the team token.
 */
function formatEventHeadline(kind, teamLabel) {
  const neutral = NEUTRAL_EVENT_TEMPLATES[kind]
  if (neutral) return { pre: neutral, team: null, post: '' }

  const template = TEAM_EVENT_TEMPLATES[kind]
  if (template && teamLabel) {
    const idx = template.indexOf('{team}')
    if (idx >= 0) {
      return {
        pre: template.slice(0, idx),
        team: teamLabel,
        post: template.slice(idx + '{team}'.length),
      }
    }
    return { pre: template, team: null, post: '' }
  }

  // Known type but no team → show the human label.
  // Unknown type → fall back to a prettified kind.
  const fallbackLabel = (kind || 'event').replace(/_/g, ' ')
  if (teamLabel) {
    return { pre: '', team: teamLabel, post: ` — ${fallbackLabel}` }
  }
  return { pre: fallbackLabel, team: null, post: '' }
}
