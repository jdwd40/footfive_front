import { useState, useEffect, useCallback } from 'react'
import { bettingApi } from '../../api/client'
import useAuthStore from '../../stores/useAuthStore'
import { formatOdds, formatFC } from '../../utils/betting'
import BetSlip from './BetSlip'

const BOARD_REFRESH_MS = 30000

/**
 * ChampionshipBettingPanel - outright cup winner odds board.
 * Bets are allowed until the semi-finals begin; eliminated teams drop off.
 */
export default function ChampionshipBettingPanel() {
  const token = useAuthStore((s) => s.token)
  const [board, setBoard] = useState(null)
  const [myBets, setMyBets] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [slipTeam, setSlipTeam] = useState(null)

  const loadBoard = useCallback(() => {
    return bettingApi
      .getChampionshipOdds()
      .then((data) => setBoard(data))
      .catch(() => {
        /* keep last board */
      })
  }, [])

  const loadMyBets = useCallback(() => {
    if (!token) {
      return Promise.resolve().then(() => setMyBets([]))
    }
    return bettingApi
      .getMyBets({ betType: 'championship_winner' })
      .then((data) => setMyBets(data.bets || []))
      .catch(() => {})
  }, [token])

  useEffect(() => {
    loadBoard()
    const interval = setInterval(loadBoard, BOARD_REFRESH_MS)
    return () => clearInterval(interval)
  }, [loadBoard])

  useEffect(() => {
    loadMyBets()
  }, [loadMyBets])

  if (!board || !board.tournamentId || board.teams.length === 0) return null

  const pendingChampBets = myBets.filter(
    (b) => b.tournamentId === board.tournamentId || b.status === 'pending'
  )

  const handlePlaceBet = async ({ teamId, stake }) => {
    const result = await bettingApi.placeChampionshipBet({ teamId, stake })
    await Promise.all([loadMyBets(), loadBoard()])
    return result
  }

  return (
    <div className="mb-6 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/5 via-card to-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-card-hover/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">👑</span>
          <span className="font-bold text-text text-sm uppercase tracking-wide">Championship Winner</span>
          {board.bettingOpen ? (
            <span className="px-2 py-0.5 rounded-full bg-gold/20 text-gold text-[10px] font-bold">OPEN</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-card-hover text-text-muted text-[10px] font-bold">CLOSED</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">{board.teams.length} teams left</span>
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
          <p className="text-[10px] uppercase tracking-wider text-gold mt-2 mb-3">
            Virtual credits only — bets close when the semi-finals begin
          </p>

          {!board.bettingOpen && (
            <p className="text-sm text-text-muted mb-3">{board.reason || 'Championship betting is closed.'}</p>
          )}

          {/* Odds grid (remaining teams only - eliminated teams drop off) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {board.teams.map((team) => (
              <button
                key={team.teamId}
                disabled={!board.bettingOpen}
                onClick={() => setSlipTeam(team)}
                className={`
                  p-2.5 rounded-xl border text-left transition-all
                  ${board.bettingOpen
                    ? 'border-border bg-card-hover/50 hover:border-gold/50 hover:bg-gold/5'
                    : 'border-border bg-card-hover/30 opacity-60 cursor-not-allowed'}
                `}
              >
                <p className="text-xs font-semibold text-text truncate">{team.teamName}</p>
                <p className="text-base font-bold font-mono text-gold">{formatOdds(team.odds)}</p>
              </button>
            ))}
          </div>

          {/* User's championship bets */}
          {pendingChampBets.length > 0 && (
            <div className="mt-3 pt-2 border-t border-border/60">
              <p className="text-[11px] text-text-muted mb-1">Your championship bets</p>
              {pendingChampBets.map((b) => (
                <p key={b.betId} className="text-xs text-text">
                  {formatFC(b.stake)} on <span className="text-gold">{b.selectedTeamName}</span> @ {formatOdds(b.oddsAtPlacement)}
                  <span className="text-text-muted"> · {b.status}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <BetSlip
        open={!!slipTeam}
        onClose={() => setSlipTeam(null)}
        title="Championship Winner"
        subtitle={`Tournament #${board.tournamentId}`}
        options={slipTeam ? [{ teamId: slipTeam.teamId, teamName: slipTeam.teamName, odds: slipTeam.odds }] : []}
        existingBets={[]}
        onPlaceBet={handlePlaceBet}
      />
    </div>
  )
}
