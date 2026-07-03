import { useState, useEffect, useRef, useCallback } from 'react'
import {
  TICKER_GOAL_SCORE_SEPARATOR,
  TICKER_SPEED_CONFIG,
  loadTickerSpeed,
  saveTickerSpeed,
  loadSeenTickerKeys,
  saveSeenTickerKeys,
  findFixtureById,
  buildGoalTickerMessage,
  isGoalTickerEvent,
  isIgnoredShootoutTickerEvent,
  getGoalDedupeKey,
} from '../../utils/tickerHelpers'

let messageIdCounter = 0
function nextMessageId() {
  messageIdCounter += 1
  return `goal-ticker-${Date.now()}-${messageIdCounter}`
}

/**
 * Round-dashboard goal ticker: each goal scrolls once, then is removed.
 * New goals are prepended to the front of the queue.
 */
export default function GoalTicker({
  goalEvents = [],
  fixtures = [],
  tournamentId = '',
  showTicker = true,
}) {
  const [{ active: activeMessage, pending: pendingQueue }, setTicker] = useState({
    active: null,
    pending: [],
  })
  const [selectedTickerSpeed, setSelectedTickerSpeed] = useState(loadTickerSpeed)

  const seenKeysRef = useRef(loadSeenTickerKeys(tournamentId))
  // Skip backlog in recentEvents on mount — only announce goals that arrive after join
  const prevEventsLengthRef = useRef(goalEvents.length)
  const scrollContainerRef = useRef(null)

  const tickerDuration =
    TICKER_SPEED_CONFIG[selectedTickerSpeed]?.duration ??
    TICKER_SPEED_CONFIG.normal.duration

  const tryMarkSeen = useCallback(
    (dedupeKey) => {
      if (!dedupeKey || seenKeysRef.current.has(dedupeKey)) return false
      seenKeysRef.current.add(dedupeKey)
      saveSeenTickerKeys(tournamentId, seenKeysRef.current)
      return true
    },
    [tournamentId],
  )

  const enqueueGoal = useCallback(
    (message) => {
      if (!message?.text || !tryMarkSeen(message.dedupeKey)) return
      setTicker((prev) => {
        if (!prev.active) {
          return { active: message, pending: prev.pending }
        }
        return { active: prev.active, pending: [message, ...prev.pending] }
      })
    },
    [tryMarkSeen],
  )

  const handleAnimationEnd = useCallback((e) => {
    if (e.animationName !== 'goal-ticker-scroll-once') return
    setTicker((prev) => {
      if (prev.pending.length === 0) {
        return { active: null, pending: [] }
      }
      const [next, ...rest] = prev.pending
      return { active: next, pending: rest }
    })
  }, [])

  // Process new goal events only (not historical recentEvents on first paint)
  useEffect(() => {
    const currentLength = goalEvents.length
    if (currentLength < prevEventsLengthRef.current) {
      prevEventsLengthRef.current = currentLength
      return
    }
    if (currentLength <= prevEventsLengthRef.current) {
      return
    }

    const newEvents = goalEvents.slice(prevEventsLengthRef.current)
    prevEventsLengthRef.current = currentLength

    newEvents.forEach((event) => {
      if (isIgnoredShootoutTickerEvent(event)) return
      const fixture = findFixtureById(fixtures, event.fixtureId)
      if (!isGoalTickerEvent(event, fixture)) return

      const built = buildGoalTickerMessage(event, fixture, fixtures)
      enqueueGoal({
        id: nextMessageId(),
        ...built,
        dedupeKey: getGoalDedupeKey(event),
      })
    })
  }, [goalEvents, fixtures, enqueueGoal])

  const handleSpeedChange = (speed) => {
    if (!(speed in TICKER_SPEED_CONFIG)) return
    setSelectedTickerSpeed(speed)
    saveTickerSpeed(speed)
  }

  if (!showTicker) {
    return null
  }

  const hasActiveGoal = Boolean(activeMessage)

  return (
    <div className="relative overflow-hidden mb-4">
      <div className="relative rounded-xl border shadow-lg bg-gradient-to-r from-live/10 via-card to-live/10 border-live/20 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div
            ref={scrollContainerRef}
            className="overflow-hidden flex-1 min-w-0 h-6 sm:h-7 relative"
            aria-live="polite"
            aria-atomic="true"
          >
            {!hasActiveGoal && (
              <span className="absolute top-1/2 -translate-y-1/2 text-xs text-text-muted italic">
                Goal announcements appear here
              </span>
            )}
            {activeMessage && (
              <span
                key={activeMessage.id}
                className="absolute top-1/2 inline-flex items-center whitespace-nowrap text-sm goal-ticker-scroll-once"
                style={{ '--ticker-duration': tickerDuration }}
                onAnimationEnd={handleAnimationEnd}
              >
                <span className="font-bold text-live tracking-wide">
                  {activeMessage.goalPart}
                </span>
                <span
                  className="text-gold font-bold px-2 sm:px-3 select-none"
                  aria-hidden="true"
                >
                  {TICKER_GOAL_SCORE_SEPARATOR.trim()}
                </span>
                <span className="font-mono font-semibold text-text">
                  {activeMessage.scorePart}
                </span>
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-1 shrink-0 self-end sm:self-center"
            role="group"
            aria-label="Ticker speed"
          >
            {Object.entries(TICKER_SPEED_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSpeedChange(key)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  selectedTickerSpeed === key
                    ? 'bg-primary text-white'
                    : 'bg-card-hover text-text-muted hover:text-text'
                }`}
                aria-pressed={selectedTickerSpeed === key}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {pendingQueue.length > 0 && (
          <p className="text-[10px] text-text-muted mt-1 sm:mt-0 sm:absolute sm:right-4 sm:bottom-1">
            +{pendingQueue.length} goal{pendingQueue.length === 1 ? '' : 's'} queued
          </p>
        )}
      </div>
    </div>
  )
}
