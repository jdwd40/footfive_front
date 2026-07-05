import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../../stores/useAuthStore'
import {
  formatFC,
  formatOdds,
  computePotentialReturn,
  validateStake,
  canSelectTeam,
} from '../../utils/betting'

const QUICK_STAKES = [10, 25, 50, 100]

/**
 * BetSlip - modal for placing a virtual bet.
 *
 * props:
 * - open, onClose
 * - title: heading (e.g. "Match Winner")
 * - subtitle: context line (e.g. "Team A vs Team B")
 * - options: [{ teamId, teamName, odds }]
 * - lockedTeamId: only this team may be selected (same-side rule), or null
 * - existingBets: user's bets already on this market (shown for context)
 * - onPlaceBet: async ({ teamId, stake }) => { bet, balance }
 */
export default function BetSlip({
  open,
  onClose,
  title,
  subtitle,
  options = [],
  lockedTeamId = null,
  existingBets = [],
  onPlaceBet,
}) {
  const { token, balance, setBalance } = useAuthStore()
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [stakeInput, setStakeInput] = useState('')
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState(null)
  const [confirmation, setConfirmation] = useState(null)

  useEffect(() => {
    if (open) {
      // Pre-select the locked side (same-side rule) or a single-option market
      setSelectedTeamId(lockedTeamId ?? (options.length === 1 ? options[0].teamId : null))
      setStakeInput('')
      setError(null)
      setConfirmation(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedTeamId])

  if (!open) return null

  const selectedOption = options.find((o) => o.teamId === selectedTeamId)
  const stakeCheck = validateStake(stakeInput, balance)
  const potential = selectedOption && stakeCheck.valid
    ? computePotentialReturn(stakeCheck.value, selectedOption.odds)
    : 0

  const handlePlace = async () => {
    if (!selectedOption || !stakeCheck.valid || placing) return
    setPlacing(true)
    setError(null)
    try {
      const result = await onPlaceBet({ teamId: selectedOption.teamId, stake: stakeCheck.value })
      if (result?.balance != null) setBalance(result.balance)
      setConfirmation({
        teamName: selectedOption.teamName,
        stake: stakeCheck.value,
        odds: result?.bet?.oddsAtPlacement ?? selectedOption.odds,
        potentialReturn: result?.bet?.potentialReturn ?? potential,
      })
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Bet failed')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-card border border-border rounded-t-3xl sm:rounded-2xl p-5 animate-slide-up shadow-2xl shadow-primary/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-lg font-bold text-text">{title}</h3>
            {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-card-hover text-text-muted hover:text-text transition-colors"
            aria-label="Close bet slip"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-[11px] uppercase tracking-wider text-accent mb-4">
          Virtual credits only — no real money
        </p>

        {!token ? (
          <div className="text-center py-6">
            <p className="text-text-muted mb-4">Sign in to place virtual bets</p>
            <Link to="/account" onClick={onClose} className="btn btn-primary">
              Login / Register
            </Link>
          </div>
        ) : confirmation ? (
          <div className="text-center py-4">
            <span className="text-5xl block mb-3">🎫</span>
            <h4 className="text-lg font-bold text-primary mb-2">Bet Placed!</h4>
            <div className="bg-card-hover/50 rounded-xl p-4 text-sm space-y-1.5 mb-4 text-left">
              <Row label="Selection" value={confirmation.teamName} />
              <Row label="Stake" value={formatFC(confirmation.stake)} />
              <Row label="Odds" value={formatOdds(confirmation.odds)} />
              <Row label="Potential return" value={formatFC(confirmation.potentialReturn)} highlight />
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={onClose} className="btn btn-primary">Done</button>
              <Link to="/bets" onClick={onClose} className="btn btn-secondary">My Bets</Link>
            </div>
          </div>
        ) : (
          <>
            {/* Existing bets on this market */}
            {existingBets.length > 0 && (
              <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm">
                <p className="text-text-muted text-xs mb-1">Your bets on this market</p>
                {existingBets.map((b) => (
                  <p key={b.betId} className="text-text">
                    {formatFC(b.stake)} on <span className="text-primary font-medium">{b.selectedTeamName}</span>
                    {' '}@ {formatOdds(b.oddsAtPlacement)}
                  </p>
                ))}
              </div>
            )}

            {/* Team selection */}
            <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 2)}, 1fr)` }}>
              {options.map((option) => {
                const allowed = canSelectTeam(existingBets, option.teamId) &&
                  (lockedTeamId == null || lockedTeamId === option.teamId)
                const selected = selectedTeamId === option.teamId
                return (
                  <button
                    key={option.teamId}
                    disabled={!allowed}
                    onClick={() => setSelectedTeamId(option.teamId)}
                    className={`
                      p-3 rounded-xl border text-left transition-all
                      ${selected
                        ? 'border-primary bg-primary/15 shadow-md shadow-primary/20'
                        : allowed
                          ? 'border-border bg-card-hover/50 hover:border-primary/40'
                          : 'border-border bg-card-hover/30 opacity-40 cursor-not-allowed'}
                    `}
                  >
                    <p className={`text-sm font-semibold truncate ${selected ? 'text-primary' : 'text-text'}`}>
                      {option.teamName}
                    </p>
                    <p className="text-lg font-bold font-mono text-text">{formatOdds(option.odds)}</p>
                    {!allowed && <p className="text-[10px] text-text-muted">Other side backed</p>}
                  </button>
                )
              })}
            </div>

            {/* Stake */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-text-muted">Stake (FC)</label>
                <span className="text-xs text-text-muted">Balance: {formatFC(balance)}</span>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text font-mono text-lg focus:border-primary focus:outline-none"
              />
              <div className="flex gap-2 mt-2">
                {QUICK_STAKES.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setStakeInput(String(amount))}
                    className="flex-1 py-1.5 rounded-lg bg-card-hover text-text-muted text-sm hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    {amount}
                  </button>
                ))}
              </div>
              {stakeInput !== '' && !stakeCheck.valid && (
                <p className="text-live text-xs mt-1.5">{stakeCheck.error}</p>
              )}
            </div>

            {/* Potential return */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-card-hover/50 mb-4">
              <span className="text-sm text-text-muted">Potential return</span>
              <span className="text-lg font-bold font-mono text-primary">{formatFC(potential)}</span>
            </div>

            {error && (
              <p className="text-live text-sm mb-3 p-2 rounded-lg bg-live/10 border border-live/20">{error}</p>
            )}

            <button
              onClick={handlePlace}
              disabled={!selectedOption || !stakeCheck.valid || placing}
              className="btn btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {placing ? 'Placing...' : selectedOption
                ? `Place ${stakeCheck.valid ? formatFC(stakeCheck.value) : 'bet'} on ${selectedOption.teamName}`
                : 'Select a team'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={highlight ? 'text-primary font-bold' : 'text-text font-medium'}>{value}</span>
    </div>
  )
}
