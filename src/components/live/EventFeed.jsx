import { useRef, useEffect, useMemo } from 'react'
import { getEventIcon, formatMatchTime } from '../../utils/formatters'
import { compareLiveEventsDesc } from '../../utils/liveEventModel'

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

  const sortedEvents = useMemo(() => {
    if (!events || events.length === 0) return []
    return [...events].sort(compareLiveEventsDesc)
  }, [events])

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
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
          homeTeamName={homeName}
          awayTeamName={awayName}
          isLatest={index === 0}
        />
      ))}
    </div>
  )
}

function EventItem({ event, homeTeamName, isLatest }) {
  const kind = eventKind(event)
  const teamLabel = event.teamName || event.team_name
  const isHomeTeam = teamLabel && homeTeamName && teamLabel === homeTeamName
  const isNeutral =
    !teamLabel ||
    [
      'match_start',
      'kickoff',
      'halftime',
      'second_half_start',
      'fulltime',
      'extra_time_start',
      'extra_time_half',
      'extra_time_end',
      'shootout_start',
      'shootout_end',
      'match_end',
      'connected',
    ].includes(kind)

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
          {formatEventLabel(kind)}
        </p>
        {event.description && (
          <p className="text-sm text-text-muted line-clamp-2">{event.description}</p>
        )}
        {(event.displayName || event.player_name) && (
          <p className="text-sm text-text-muted truncate">
            {event.displayName || event.player_name}
          </p>
        )}
        {(event.assistName || event.assist_name) && (
          <p className="text-xs text-text-muted">
            Assist: {event.assistName || event.assist_name}
          </p>
        )}
        {teamLabel && !isNeutral && (
          <p className={`text-xs ${isHomeTeam ? 'text-primary' : 'text-blue-400'}`}>{teamLabel}</p>
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

function formatEventLabel(type) {
  const labels = {
    goal: 'GOAL!!!',
    penalty_scored: 'Penalty Scored',
    penalty_goal: 'PENALTY SCORED!',
    shot_saved: 'Shot Saved',
    shot_missed: 'Shot Off Target',
    yellow_card: 'Yellow Card',
    red_card: 'RED CARD!',
    foul: 'Foul',
    corner: 'Corner Kick',
    penalty_awarded: 'PENALTY!',
    penalty_saved: 'Penalty Saved',
    penalty_missed: 'Penalty Missed',
    kickoff: 'Kick Off',
    match_start: 'Kick Off',
    halftime: 'Half Time',
    second_half_start: 'Second Half',
    fulltime: 'Full Time (90)',
    extra_time_start: 'Extra Time',
    extra_time_half: 'ET Half Time',
    extra_time_end: 'Extra Time End',
    shootout_start: 'Shootout Begins',
    shootout_goal: 'Shootout Goal',
    shootout_miss: 'Shootout Miss',
    shootout_save: 'Shootout Save',
    shootout_end: 'Shootout Over',
    match_end: 'Match Over',
    substitution: 'Substitution',
    offside: 'Offside',
    var_check: 'VAR Review',
  }
  return labels[type] || type?.replace(/_/g, ' ') || 'Event'
}
