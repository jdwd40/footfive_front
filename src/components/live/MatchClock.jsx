/* eslint-disable react-hooks/set-state-in-effect -- clock display syncs from props/events */
import { useState, useEffect, useMemo } from 'react'
import { formatMatchTime } from '../../utils/formatters'
import { getLatestMatchPhaseFromEvents } from '../../utils/liveEventModel'

function eventKind(e) {
  return e?.type || e?.event_type || e?.eventType || ''
}

// Match-level phase stamped by the backend on every event (Improvement #2).
// Preferred over the event-type scan below, which stays as fallback for old
// events / old backends that don't carry matchPhase.
const MATCH_PHASE_LABELS = {
  pre_match: 'Pre-Match',
  first_half: '1st Half',
  halftime: 'Half Time',
  second_half: '2nd Half',
  extra_time_first_half: 'Extra Time',
  extra_time_halftime: 'ET Half Time',
  extra_time_second_half: 'ET 2nd Half',
  penalty_shootout: 'Penalty Shootout',
  finished: 'Match Ended',
}

export default function MatchClock({ events, isLive, matchMinute }) {
  const [displayTime, setDisplayTime] = useState({ minute: 0, second: 0 })

  const normalizedEvents = useMemo(() => events || [], [events])

  useEffect(() => {
    if (matchMinute != null && Number.isFinite(Number(matchMinute))) {
      setDisplayTime({ minute: Number(matchMinute), second: 0 })
      return
    }
    if (!normalizedEvents.length) {
      setDisplayTime({ minute: 0, second: 0 })
      return
    }

    const latestEvent = normalizedEvents.reduce((latest, event) => {
      const m = Number(event.minute) || 0
      const lm = Number(latest.minute) || 0
      const s = Number(event.second) || 0
      const ls = Number(latest.second) || 0
      if (m > lm) return event
      if (m === lm && s > ls) return event
      return latest
    }, normalizedEvents[0])

    setDisplayTime({
      minute: Number(latestEvent.minute) || 0,
      second: Number(latestEvent.second) || 0,
    })
  }, [normalizedEvents, matchMinute])

  const getPeriod = () => {
    if (!normalizedEvents.length) return 'Pre-Match'

    // Prefer the structured matchPhase of the latest visible event.
    const phase = getLatestMatchPhaseFromEvents(normalizedEvents)
    if (phase && MATCH_PHASE_LABELS[phase]) return MATCH_PHASE_LABELS[phase]

    // Fallback: legacy event-type scan (events without matchPhase).
    const kinds = new Set(normalizedEvents.map(eventKind))
    const hasKickoff = kinds.has('kickoff') || kinds.has('match_start')
    const hasHalftime = kinds.has('halftime')
    const hasSecondHalf = kinds.has('second_half_start')
    const hasEt = kinds.has('extra_time_start')
    const hasEtHalf = kinds.has('extra_time_half') || kinds.has('et_halftime')
    const hasFulltime = kinds.has('fulltime')
    const hasShootout = kinds.has('shootout_start')
    const hasShootoutEnd = kinds.has('shootout_end')
    const hasMatchEnd = kinds.has('match_end')

    if (hasMatchEnd || hasShootoutEnd) return 'Match Ended'
    if (hasShootout) return 'Penalty Shootout'
    if (hasFulltime && !hasEt) return 'Full Time'
    if (hasEt && hasEtHalf && displayTime.minute >= 105) return 'ET 2nd Half'
    if (hasEt && hasEtHalf) return 'ET Half Time'
    if (hasEt) return 'Extra Time'
    if (hasHalftime && hasSecondHalf) return '2nd Half'
    if (hasHalftime) return 'Half Time'
    if (hasKickoff) return '1st Half'
    return 'Pre-Match'
  }

  const period = getPeriod()
  const isMatchOver = period === 'Full Time' || period === 'Match Ended'

  return (
    <div className="text-center">
      <div
        className={`
        inline-flex items-center justify-center
        px-6 py-3 rounded-2xl
        ${isLive && !isMatchOver ? 'bg-primary/20 border border-primary/50' : 'bg-card border border-border'}
        transition-all duration-300
      `}
      >
        <span
          className={`
          text-4xl font-mono font-bold tracking-wider
          ${isLive && !isMatchOver ? 'text-primary' : 'text-text'}
        `}
        >
          {formatMatchTime(displayTime.minute, displayTime.second)}
        </span>

        {isLive && !isMatchOver && (
          <span className="ml-3 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>

      <div
        className={`
        mt-2 text-sm font-medium uppercase tracking-wide
        ${isLive && !isMatchOver ? 'text-primary' : 'text-text-muted'}
      `}
      >
        {period}
      </div>
    </div>
  )
}
