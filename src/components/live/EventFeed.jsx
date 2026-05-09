import { useRef, useEffect, useMemo } from 'react'
import { getEventIcon, formatMatchTime } from '../../utils/formatters'
import { compareLiveEventsDesc, resolveEventTeam } from '../../utils/liveEventModel'

/** Resolve event kind for display (unified `type` or legacy `event_type`). */
function eventKind(event) {
  return event?.type || event?.event_type || event?.eventType || ''
}

export default function EventFeed({
  events,
  homeTeam,
  awayTeam,
  autoScroll = true,
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

  return (
    <div
      ref={feedRef}
      className="space-y-2 max-h-96 overflow-y-auto pr-2 scroll-smooth"
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
  const { team: resolvedTeam, side } = resolveEventTeam(event, { homeTeam, awayTeam })
  const teamLabel = resolvedTeam?.name || null
  const isHomeTeam = side === 'home'
  const isMatchStateEvent = NEUTRAL_EVENT_TEMPLATES[kind] != null
  const isNeutral = !teamLabel || isMatchStateEvent

  const playerName =
    event.displayName || event.player_name || event.player?.name || null
  const assistName =
    event.assistName || event.assist_name || event.assist?.name || null
  const description = sanitizeEventDescription(event.description, {
    teamName: teamLabel,
    playerName,
  })

  const isGoal =
    kind === 'goal' ||
    kind === 'penalty_goal' ||
    kind === 'penalty_scored' ||
    kind === 'shootout_goal'
  const isImportant =
    isGoal ||
    kind === 'red_card' ||
    kind === 'penalty_awarded' ||
    kind === 'yellow_card'

  const minute = event.minute != null ? event.minute : 0
  const second = event.second != null ? event.second : 0

  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-xl transition-all duration-300
        ${isLatest ? 'animate-slide-up' : ''}
        ${
          isGoal
            ? 'bg-primary/15 border border-primary/40 shadow-lg shadow-primary/20'
            : isImportant
              ? 'bg-yellow-500/10 border border-yellow-500/30'
              : 'bg-card hover:bg-card-hover'
        }
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
        w-10 h-10 rounded-full flex items-center justify-center text-xl
        ${isGoal ? 'bg-primary/30 animate-pulse' : 'bg-card-hover'}
      `}
      >
        {getEventIcon(kind)}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${isGoal ? 'text-primary text-lg' : 'text-text'}`}>
          {(() => {
            const { pre, team, post } = formatEventHeadline(kind, teamLabel)
            const teamColor = isHomeTeam ? 'text-primary' : 'text-blue-400'
            return (
              <>
                {pre}
                {team && (
                  <span className={teamColor}>{team}</span>
                )}
                {post}
              </>
            )
          })()}
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
  shootout_end: 'Shootout Over',
  match_end: 'Match Over',
  connected: 'Connected',
  var_check: 'VAR Review',
  final_score: 'Final Score',
  match_draw: 'Match Drawn',
}

// Team-affiliated events. `{team}` is replaced with the resolved team name.
const TEAM_EVENT_TEMPLATES = {
  goal: '{team} GOAL!!!',
  penalty_scored: '{team} score from the spot',
  penalty_goal: '{team} score from the spot',
  shootout_goal: '{team} score in the shootout',
  shootout_miss: '{team} miss in the shootout',
  shootout_save: '{team}’s penalty saved',
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
  penalty_awarded: 'PENALTY to {team}!',
  penalty_saved: '{team}’s penalty saved',
  penalty_missed: '{team}’s penalty missed',
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
