import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { liveApi } from '../api/client'
import useLiveStore from '../stores/useLiveStore'
import useLiveEvents from '../hooks/useLiveEvents'
import MatchClock from '../components/live/MatchClock'
import EventFeed from '../components/live/EventFeed'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorDisplay from '../components/common/ErrorDisplay'
import { useToast } from '../components/common/Toast'
import {
  dedupeLiveEventsBySeq,
  sortLiveEventsDesc,
} from '../utils/liveEventModel'

const SEQ_STORAGE_PREFIX = 'footfive:lastSeq:'
const LIVE_MATCH_POLL_MS = 2000

const MATCH_STATE_LABELS = {
  SCHEDULED: 'Scheduled',
  FIRST_HALF: '1st Half',
  HALFTIME: 'Half Time',
  SECOND_HALF: '2nd Half',
  EXTRA_TIME_1: 'Extra Time 1st',
  ET_HALFTIME: 'ET Break',
  EXTRA_TIME_2: 'Extra Time 2nd',
  PENALTIES: 'Penalty Shootout',
  FINISHED: 'Full Time',
}

function applyLiveEventToMatch(match, event) {
  if (!match) return match

  const updates = {}
  if (event.minute != null) updates.minute = event.minute
  if (event.second != null) updates.second = event.second
  if (event.score) updates.score = event.score
  if (event.penaltyScore) updates.penaltyScore = event.penaltyScore

  return Object.keys(updates).length > 0 ? { ...match, ...updates } : match
}

function applyMatchSnapshot(match, snapshot) {
  if (!snapshot) return match
  return match ? { ...match, ...snapshot } : snapshot
}

function readStoredSeq(fixtureId) {
  try {
    const v = sessionStorage.getItem(`${SEQ_STORAGE_PREFIX}${fixtureId}`)
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function writeStoredSeq(fixtureId, seq) {
  try {
    if (seq > 0) sessionStorage.setItem(`${SEQ_STORAGE_PREFIX}${fixtureId}`, String(seq))
  } catch {
    /* ignore */
  }
}

export default function LiveMatchDetail() {
  const { fixtureId } = useParams()
  const { addToast } = useToast()

  const [match, setMatch] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bootstrapDone, setBootstrapDone] = useState(false)
  const [seedAfterSeq, setSeedAfterSeq] = useState(0)

  const storeMatch = useLiveStore((state) =>
    state.matches.find((m) => m.fixtureId == fixtureId || String(m.fixtureId) === String(fixtureId))
  )

  const onEvent = useCallback(
    (event) => {
      console.log('[LMD] onEvent', event.type, 'seq', event.seq, 'fixtureId', event.fixtureId, 'route', fixtureId)
      if (event.type === 'connected') return
      // SSE stream already filtered by fixtureId on the backend; only drop
      // when the event carries an explicit, mismatched id. Flow events
      // (possession/save/miss/etc.) often omit fixtureId on the stream.
      if (event.fixtureId != null && String(event.fixtureId) !== String(fixtureId)) {
        console.log('[LMD] dropped: fixtureId mismatch')
        return
      }

      useLiveStore.getState().handleEvent(event)

      setMatch((prev) => applyLiveEventToMatch(prev, event))

      setEvents((prev) => {
        if (event.seq > 0 && prev.some((e) => e.seq === event.seq)) return prev
        return sortLiveEventsDesc(dedupeLiveEventsBySeq([...prev, event]))
      })

      if (event.seq > 0) {
        writeStoredSeq(fixtureId, event.seq)
        setSeedAfterSeq((s) => Math.max(s, event.seq))
      }

      if (event.type === 'goal' || event.type === 'penalty_scored' || event.type === 'shootout_goal') {
        addToast(`⚽ ${event.displayName || 'Goal'}`, 'goal', 5000)
      } else if (event.type === 'halftime') {
        setMatch((prev) => (prev ? { ...prev, state: 'HALFTIME' } : prev))
      } else if (event.type === 'second_half_start') {
        setMatch((prev) => (prev ? { ...prev, state: 'SECOND_HALF' } : prev))
      } else if (event.type === 'extra_time_start') {
        setMatch((prev) => (prev ? { ...prev, state: 'EXTRA_TIME_1' } : prev))
        addToast('⚡ Extra Time!', 'info', 5000)
      } else if (event.type === 'extra_time_half' || event.type === 'et_halftime') {
        setMatch((prev) => (prev ? { ...prev, state: 'ET_HALFTIME' } : prev))
      } else if (event.type === 'extra_time_2_start' || event.type === 'extra_time_end') {
        setMatch((prev) => (prev ? { ...prev, state: 'EXTRA_TIME_2' } : prev))
      } else if (event.type === 'shootout_start') {
        setMatch((prev) => (prev ? { ...prev, state: 'PENALTIES' } : prev))
        addToast('🎯 Penalty Shootout!', 'info', 5000)
      } else if (event.type === 'fulltime') {
        addToast('⏱️ Full Time', 'info', 4000)
      } else if (event.type === 'match_end' || event.type === 'shootout_end') {
        setMatch((prev) =>
          prev ? { ...prev, state: 'FINISHED', isFinished: true, score: event.score || prev.score } : prev
        )
        addToast('🏆 Match complete', 'info', 5000)
      } else if (event.type === 'match_start') {
        setMatch((prev) =>
          prev
            ? { ...prev, state: 'FIRST_HALF', isFinished: false, score: prev.score || { home: 0, away: 0 } }
            : prev
        )
      }
    },
    [fixtureId, addToast]
  )

  const { connected, connecting, error: sseError, reconnect } = useLiveEvents({
    fixtureId: fixtureId ? parseInt(fixtureId, 10) : null,
    seedAfterSeq,
    onEvent,
    enabled: bootstrapDone && !!fixtureId,
  })

  const fetchMatch = useCallback(async () => {
    setLoading(true)
    setError(null)
    setBootstrapDone(false)

    try {
      let data = null
      try {
        data = await liveApi.getMatch(fixtureId)
      } catch {
        data = null
      }

      const sm = useLiveStore.getState().matches.find((m) => m.fixtureId == fixtureId || String(m.fixtureId) === String(fixtureId))
      const fb = useLiveStore.getState().fixtures.find((m) => m.fixtureId == fixtureId || String(m.fixtureId) === String(fixtureId))

      if (!data && sm) {
        data = sm
      }
      if (!data && fb) {
        data = fb
      }

      if (data) {
        setMatch(data)
      }

      const eventsRes = await liveApi.getRecentEvents({
        fixtureId: parseInt(fixtureId, 10),
        limit: 200,
      })

      const fromApi = eventsRes.events || []
      const fromStore = useLiveStore.getState().getEventsForMatch(fixtureId)
      const merged = dedupeLiveEventsBySeq([...fromStore, ...fromApi])
      const sorted = sortLiveEventsDesc(merged)

      let maxSeq = sorted.reduce((m, e) => Math.max(m, Number(e.seq) || 0), 0)
      maxSeq = Math.max(maxSeq, readStoredSeq(fixtureId))

      setEvents(sorted)
      setSeedAfterSeq(maxSeq)

      if (!data) {
        setError('Failed to load match')
      }
    } catch (err) {
      const fallback = useLiveStore.getState().matches.find((m) => m.fixtureId == fixtureId || String(m.fixtureId) === String(fixtureId))
      if (fallback) {
        setMatch(fallback)
      } else {
        setError(err.message || 'Failed to load match')
      }
    } finally {
      setLoading(false)
      setBootstrapDone(true)
    }
  }, [fixtureId])

  useEffect(() => {
    fetchMatch()
  }, [fetchMatch])

  useEffect(() => {
    if (storeMatch && !match) {
      setMatch(storeMatch)
    }
  }, [storeMatch, match])

  const shouldPollMatch =
    bootstrapDone &&
    !!fixtureId &&
    !!match &&
    match.state !== 'FINISHED' &&
    match.isFinished !== true

  useEffect(() => {
    if (!shouldPollMatch) return

    let cancelled = false

    const pollMatch = async () => {
      try {
        const data = await liveApi.getMatch(fixtureId)
        if (cancelled || !data) return

        setMatch((prev) => applyMatchSnapshot(prev, data))
        useLiveStore.getState().updateMatch(fixtureId, data)
      } catch (err) {
        console.error('[LiveMatchDetail] Failed to poll match:', err)
      }
    }

    pollMatch()
    const interval = setInterval(pollMatch, LIVE_MATCH_POLL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [fixtureId, shouldPollMatch])

  const isLive = useMemo(() => {
    if (!match) return false
    return (
      ['FIRST_HALF', 'SECOND_HALF', 'EXTRA_TIME_1', 'EXTRA_TIME_2', 'PENALTIES', 'HALFTIME', 'ET_HALFTIME'].includes(
        match.state
      ) && !match.isFinished
    )
  }, [match])

  const stateLabel = match?.state ? MATCH_STATE_LABELS[match.state] : 'Loading...'

  if (loading && !match) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <LoadingSpinner size="lg" className="mb-4" />
          <p className="text-text-muted">Loading match...</p>
        </div>
      </div>
    )
  }

  if (error && !match) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ErrorDisplay message={error} onRetry={fetchMatch} />
        <div className="text-center mt-4">
          <Link to="/live" className="text-primary hover:underline">
            ← Back to Live Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/live"
          className="inline-flex items-center gap-2 text-text-muted hover:text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Live Dashboard
        </Link>

        <ConnectionIndicator
          connected={connected}
          connecting={connecting}
          sseError={sseError}
          onReconnect={() => reconnect(true)}
        />
      </div>

      <div
        className={`
        rounded-2xl bg-card border p-6 mb-6
        ${isLive ? 'border-primary/50 shadow-xl shadow-primary/20' : 'border-border'}
      `}
      >
        <div className="flex items-center justify-center mb-4">
          <span
            className={`
            inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold
            ${
              isLive
                ? 'bg-primary/20 text-primary'
                : match?.state === 'FINISHED'
                  ? 'bg-slate-500/20 text-slate-400'
                  : 'bg-amber-500/20 text-amber-400'
            }
          `}
          >
            {isLive && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
            {match?.minute !== undefined && isLive ? `${match.minute}' - ${stateLabel}` : stateLabel}
          </span>
        </div>

        <div className="mb-6">
          <MatchClock events={events} isLive={isLive} matchMinute={match?.minute} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-4xl shadow-lg">
              ⚽
            </div>
            <h2
              className={`text-lg font-bold truncate px-2 ${
                match?.score?.home > match?.score?.away ? 'text-primary' : 'text-text'
              }`}
            >
              {match?.homeTeam?.name || 'Home Team'}
            </h2>
          </div>

          <div className="text-center px-4">
            <div className="flex items-center gap-4">
              <ScoreDigit value={match?.score?.home ?? 0} isWinning={match?.score?.home > match?.score?.away} />
              <span className="text-3xl text-text-muted">-</span>
              <ScoreDigit value={match?.score?.away ?? 0} isWinning={match?.score?.away > match?.score?.home} />
            </div>

            {(match?.penaltyScore?.home > 0 || match?.penaltyScore?.away > 0) && (
              <p className="text-sm text-text-muted mt-2">
                ({match.penaltyScore.home} - {match.penaltyScore.away} pens)
              </p>
            )}
          </div>

          <div className="flex-1 text-center">
            <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-500/30 to-blue-500/10 flex items-center justify-center text-4xl shadow-lg">
              ⚽
            </div>
            <h2
              className={`text-lg font-bold truncate px-2 ${
                match?.score?.away > match?.score?.home ? 'text-primary' : 'text-text'
              }`}
            >
              {match?.awayTeam?.name || 'Away Team'}
            </h2>
          </div>
        </div>

        {match?.stats && (
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-semibold text-text-muted text-center mb-4">Match Stats</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <StatRow label="Shots" home={match.stats.home?.shots} away={match.stats.away?.shots} />
              <StatRow
                label="On Target"
                home={match.stats.home?.shotsOnTarget}
                away={match.stats.away?.shotsOnTarget}
              />
              <StatRow label="Corners" home={match.stats.home?.corners} away={match.stats.away?.corners} />
              <StatRow label="Fouls" home={match.stats.home?.fouls} away={match.stats.away?.fouls} />
              <StatRow label="xG" home={match.stats.home?.xg?.toFixed(2)} away={match.stats.away?.xg?.toFixed(2)} />
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text">Match Events</h3>
          {isLive && (
            <span className="flex items-center gap-2 text-sm text-text-muted">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Live updates
            </span>
          )}
        </div>

        <EventFeed
          events={events}
          homeTeam={match?.homeTeam}
          awayTeam={match?.awayTeam}
          autoScroll={isLive}
        />
      </div>

      {match?.state === 'FINISHED' && (
        <div className="mt-6 text-center">
          <Link to="/live" className="text-primary hover:underline">
            ← Back to Live Dashboard
          </Link>
        </div>
      )}
    </div>
  )
}

function ConnectionIndicator({ connected, connecting, sseError, onReconnect }) {
  if (connected) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </div>
        {sseError && <span className="text-xs text-amber-400 max-w-[200px] text-right">{sseError}</span>}
      </div>
    )
  }

  if (connecting) {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-400">
        <LoadingSpinner size="sm" />
        Connecting...
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onReconnect}
      className="flex flex-col items-end gap-1 text-sm text-red-400 hover:text-red-300"
    >
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        Reconnect
      </span>
      {sseError && <span className="text-xs max-w-[220px] text-right">{sseError}</span>}
    </button>
  )
}

function ScoreDigit({ value, isWinning }) {
  return (
    <div
      className={`
      w-16 h-20 rounded-xl flex items-center justify-center
      text-5xl font-bold transition-all duration-300
      ${isWinning ? 'bg-primary/20 text-primary shadow-lg shadow-primary/25' : 'bg-card-hover text-text'}
    `}
    >
      {value}
    </div>
  )
}

function StatRow({ label, home, away }) {
  return (
    <>
      <div className="text-right text-text">{home ?? '-'}</div>
      <div className="text-center text-text-muted">{label}</div>
      <div className="text-left text-text">{away ?? '-'}</div>
    </>
  )
}
