import { useState, useEffect, useCallback } from 'react'
import { bettingApi } from '../../api/client'
import useAuthStore from '../../stores/useAuthStore'
import { formatOdds, formatFC, summarizeFixtureBets, getLockedTeamId } from '../../utils/betting'
import BetSlip from './BetSlip'

/**
 * FixtureBetBar - compact pre-match odds + bet entry for a scheduled fixture.
 * Rendered under fixture cards on the fixtures screen.
 */
export default function FixtureBetBar({ fixtureId, homeTeam, awayTeam }) {
  const token = useAuthStore((s) => s.token)
  const [oddsData, setOddsData] = useState(null)
  const [myBets, setMyBets] = useState([])
  const [slipOpen, setSlipOpen] = useState(false)

  const loadOdds = useCallback(() => {
    return bettingApi
      .getFixtureOdds(fixtureId)
      .then((data) => setOddsData(data))
      .catch(() => setOddsData(null))
  }, [fixtureId])

  const loadMyBets = useCallback(() => {
    if (!token) {
      return Promise.resolve().then(() => setMyBets([]))
    }
    return bettingApi
      .getMyBets({ fixtureId })
      .then((data) => setMyBets(data.bets || []))
      .catch(() => setMyBets([]))
  }, [fixtureId, token])

  useEffect(() => {
    loadOdds()
  }, [loadOdds])

  useEffect(() => {
    loadMyBets()
  }, [loadMyBets])

  if (!oddsData?.odds || !oddsData.bettingOpen) return null

  const betSummary = summarizeFixtureBets(myBets)
  const options = [
    { teamId: oddsData.homeTeam?.id ?? homeTeam?.id, teamName: oddsData.homeTeam?.name ?? homeTeam?.name, odds: oddsData.odds.home.odds },
    { teamId: oddsData.awayTeam?.id ?? awayTeam?.id, teamName: oddsData.awayTeam?.name ?? awayTeam?.name, odds: oddsData.odds.away.odds },
  ]

  const handlePlaceBet = async ({ teamId, stake }) => {
    const result = await bettingApi.placeFixtureBet({ fixtureId, teamId, stake })
    await loadMyBets()
    return result
  }

  return (
    <div className="mt-2 pt-2 border-t border-border/60">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-mono text-text-muted">
          <span className="px-1.5 py-0.5 rounded bg-card-hover">{formatOdds(oddsData.odds.home.odds)}</span>
          <span className="text-[10px]">vs</span>
          <span className="px-1.5 py-0.5 rounded bg-card-hover">{formatOdds(oddsData.odds.away.odds)}</span>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setSlipOpen(true)
          }}
          className="px-3 py-1 rounded-lg bg-primary/15 text-primary text-xs font-bold uppercase tracking-wide hover:bg-primary/25 transition-colors"
        >
          Bet
        </button>
      </div>

      {betSummary && (
        <p className="mt-1.5 text-[11px] text-primary/80">
          🎫 {betSummary.count} bet{betSummary.count > 1 ? 's' : ''} on {betSummary.teamName} · {formatFC(betSummary.totalStake)} staked
        </p>
      )}

      <BetSlip
        open={slipOpen}
        onClose={() => setSlipOpen(false)}
        title="Match Winner"
        subtitle={`${options[0].teamName} vs ${options[1].teamName}`}
        options={options}
        lockedTeamId={getLockedTeamId(myBets)}
        existingBets={myBets}
        onPlaceBet={handlePlaceBet}
      />
    </div>
  )
}
