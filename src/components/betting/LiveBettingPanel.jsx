import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { bettingApi } from '../../api/client'
import useAuthStore from '../../stores/useAuthStore'
import {
  formatOdds,
  formatFC,
  validateStake,
  computePotentialReturn,
  canSelectTeam,
  getLockedTeamId,
} from '../../utils/betting'

const ODDS_POLL_MS = 10000

/**
 * LiveBettingPanel - compact in-play winner betting for the live match screen.
 *
 * Runs entirely on its own polling timer so it never touches the event
 * reveal queue, score sync, or commentary pacing.
 */
export default function LiveBettingPanel({ fixtureId, isFinished }) {
  const { token, balance, setBalance } = useAuthStore()
  const [oddsData, setOddsData] = useState(null)
  const [myBets, setMyBets] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [stakeInput, setStakeInput] = useState('')
  const [placing, setPlacing] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'ok'|'error', message }
  const pollRef = useRef(null)

  const bettingClosed = isFinished || (oddsData && !oddsData.bettingOpen)

  const loadOdds = useCallback(async () => {
    try {
      const data = await bettingApi.getLiveOdds(fixtureId)
      setOddsData(data)
    } catch {
      /* keep last odds on transient errors */
    }
  }, [fixtureId])

  const loadMyBets = useCallback(async () => {
    const data = token
      ? await bettingApi.getMyBets({ fixtureId }).catch(() => null)
      : await Promise.resolve({ bets: [] })
    if (data) setMyBets(data.bets || [])
  }, [fixtureId, token])

  // Poll odds while the match is live; stop once finished.
  useEffect(() => {
    if (isFinished) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    loadOdds()
    pollRef.current = setInterval(loadOdds, ODDS_POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [loadOdds, isFinished])

  useEffect(() => {
    loadMyBets()
  }, [loadMyBets])

  // Nothing to show until we've seen odds at least once (e.g. match not tracked)
  if (!oddsData) return null

  const options = oddsData.odds
    ? [
        { teamId: oddsData.homeTeam?.id, teamName: oddsData.homeTeam?.name, odds: oddsData.odds.home.odds },
        { teamId: oddsData.awayTeam?.id, teamName: oddsData.awayTeam?.name, odds: oddsData.odds.away.odds },
      ]
    : []

  const lockedTeamId = getLockedTeamId(myBets)
  const selectedOption = options.find((o) => o.teamId === selectedTeamId)
  const stakeCheck = validateStake(stakeInput, balance)
  const potential = selectedOption && stakeCheck.valid
    ? computePotentialReturn(stakeCheck.value, selectedOption.odds)
    : 0

  const handlePlace = async () => {
    if (!selectedOption || !stakeCheck.valid || placing || bettingClosed) return
    setPlacing(true)
    setFeedback(null)
    try {
      const result = await bettingApi.placeLiveBet({
        fixtureId,
        teamId: selectedOption.teamId,
        stake: stakeCheck.value,
      })
      if (result?.balance != null) setBalance(result.balance)
      setFeedback({
        type: 'ok',
        message: `Bet placed: ${formatFC(stakeCheck.value)} on ${selectedOption.teamName} @ ${formatOdds(result?.bet?.oddsAtPlacement)}`,
      })
      setStakeInput('')
      setSelectedTeamId(null)
      await loadMyBets()
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.error || err.message || 'Bet failed' })
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="rounded-2xl bg-card border border-accent/30 overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-card-hover/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🎰</span>
          <span className="font-bold text-text text-sm uppercase tracking-wide">Live Betting</span>
          {!bettingClosed && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              IN-PLAY
            </span>
          )}
          {bettingClosed && (
            <span className="px-2 py-0.5 rounded-full bg-card-hover text-text-muted text-[10px] font-bold">
              CLOSED
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {options.length > 0 && !expanded && (
            <span className="text-xs font-mono text-text-muted">
              {formatOdds(options[0].odds)} / {formatOdds(options[1].odds)}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/60">
          <p className="text-[10px] uppercase tracking-wider text-accent mt-2 mb-3">
            Virtual credits only — odds update with the match
          </p>

          {bettingClosed ? (
            <p className="text-sm text-text-muted py-2">
              {isFinished ? 'Match over — betting closed.' : oddsData.reason || 'Betting closed.'}
            </p>
          ) : !token ? (
            <p className="text-sm text-text-muted py-2">
              <Link to="/account" className="text-primary hover:underline">Sign in</Link> to place live bets.
            </p>
          ) : (
            <>
              {/* Odds buttons */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {options.map((option) => {
                  const allowed = canSelectTeam(myBets, option.teamId)
                  const selected = selectedTeamId === option.teamId
                  return (
                    <button
                      key={option.teamId}
                      disabled={!allowed}
                      onClick={() => setSelectedTeamId(selected ? null : option.teamId)}
                      className={`
                        p-2.5 rounded-xl border text-center transition-all
                        ${selected
                          ? 'border-accent bg-accent/15'
                          : allowed
                            ? 'border-border bg-card-hover/50 hover:border-accent/40'
                            : 'border-border bg-card-hover/30 opacity-40 cursor-not-allowed'}
                      `}
                    >
                      <p className={`text-xs font-semibold truncate ${selected ? 'text-accent' : 'text-text'}`}>
                        {option.teamName}
                      </p>
                      <p className="text-base font-bold font-mono text-text">{formatOdds(option.odds)}</p>
                    </button>
                  )
                })}
              </div>

              {/* Stake + place */}
              {selectedOption && (
                <div className="flex gap-2 items-start mb-1">
                  <div className="flex-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="1"
                      value={stakeInput}
                      onChange={(e) => setStakeInput(e.target.value)}
                      placeholder="Stake (FC)"
                      className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text font-mono text-sm focus:border-accent focus:outline-none"
                    />
                    {stakeInput !== '' && !stakeCheck.valid && (
                      <p className="text-live text-[11px] mt-1">{stakeCheck.error}</p>
                    )}
                    {potential > 0 && (
                      <p className="text-[11px] text-text-muted mt-1">
                        Returns <span className="text-accent font-semibold">{formatFC(potential)}</span>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handlePlace}
                    disabled={!stakeCheck.valid || placing}
                    className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
                  >
                    {placing ? '...' : 'Bet'}
                  </button>
                </div>
              )}

              {feedback && (
                <p className={`text-xs mt-2 ${feedback.type === 'ok' ? 'text-primary' : 'text-live'}`}>
                  {feedback.message}
                </p>
              )}
            </>
          )}

          {/* Existing bets on this fixture */}
          {myBets.length > 0 && (
            <div className="mt-3 pt-2 border-t border-border/60">
              <p className="text-[11px] text-text-muted mb-1">Your bets on this match</p>
              {myBets.map((b) => (
                <p key={b.betId} className="text-xs text-text">
                  {formatFC(b.stake)} on <span className="text-primary">{b.selectedTeamName}</span> @ {formatOdds(b.oddsAtPlacement)}
                  <span className="text-text-muted"> · {b.status}</span>
                </p>
              ))}
              {lockedTeamId && !bettingClosed && (
                <p className="text-[10px] text-text-muted mt-1">You can only add bets on the same team.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
