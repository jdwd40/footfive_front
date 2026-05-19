import { getEventIcon, formatMatchTime } from '../../utils/formatters'

export default function EventTimeline({ events, homeTeam, awayTeam }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted">
        No events recorded
      </div>
    )
  }

  // Sort events by minute/second
  const sortedEvents = [...events].sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute
    return (a.second || 0) - (b.second || 0)
  })

  return (
    <div className="space-y-2">
      {sortedEvents.map((event, index) => {
        const isHomeTeam = event.team_name === homeTeam
        const isNeutral = !event.team_name || ['kickoff', 'halftime', 'fulltime', 'shootout_start', 'shootout_end'].includes(event.event_type)
        
        return (
          <div
            key={event.event_id || index}
            className={`
              flex items-center gap-3 p-3 rounded-lg transition-all
              ${event.event_type === 'goal' ? 'bg-primary/10 border border-primary/30' : 'bg-card'}
              ${isNeutral ? 'justify-center' : isHomeTeam ? 'justify-start' : 'justify-end flex-row-reverse'}
            `}
          >
            {/* Time */}
            <span className="text-xs font-mono text-text-muted min-w-[45px] text-center">
              {formatMatchTime(event.minute, event.second)}
            </span>

            {/* Icon */}
            <span className="text-lg">{getEventIcon(event.event_type)}</span>

            {/* Details */}
            <div className={`flex flex-col ${isNeutral ? 'items-center' : isHomeTeam ? 'items-start' : 'items-end'}`}>
              <span className="text-sm font-medium text-text">
                {formatEventType(event.event_type)}
              </span>
              {event.player_name && (
                <span className="text-xs text-text-muted">{event.player_name}</span>
              )}
              {event.team_name && !isNeutral && (
                <span className="text-xs text-primary">{event.team_name}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatEventType(type) {
  const labels = {
    goal: 'GOAL!',
    shot_saved: 'Shot Saved',
    shot_missed: 'Shot Missed',
    yellow_card: 'Yellow Card',
    red_card: 'Red Card',
    foul: 'Foul',
    corner: 'Corner',
    penalty_awarded: 'Penalty Awarded',
    penalty_goal: 'Penalty Scored',
    penalty_saved: 'Penalty Saved',
    penalty_missed: 'Penalty Missed',
    penalty_walkup: 'Walk-up to the Spot',
    penalty_run_up: 'Penalty Run-up',
    kickoff: 'Kick Off',
    halftime: 'Half Time',
    fulltime: 'Full Time',
    shootout_start: 'Shootout Begins',
    shootout_end: 'Shootout Decided',
    shootout_goal: 'Shootout Goal',
    shootout_save: 'Shootout Save',
    shootout_miss: 'Shootout Miss',
    shootout_walkup: 'Shootout Walk-up',
    shootout_reaction: 'Shootout Reaction',
    shot_blocked: 'Shot Blocked',
    counter_attack: 'Counter Attack',
    penalty_scored: 'Penalty Scored',
    midfield_battle: 'Midfield Battle',
    goal_build_up: 'Goal Build Up',
    attack_breakdown: 'Attack Breakdown',
    counter_breakdown: 'Counter Breakdown',
    kickoff_restart: 'Play Resumes',
    extra_time_start: 'Extra Time',
    substitution: 'Substitution',
    offside: 'Offside',
    var_check: 'VAR Check',
  }
  return labels[type] || type?.replace(/_/g, ' ') || 'Event'
}

