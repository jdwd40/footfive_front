import { useCallback, useEffect, useState } from 'react'
import { garageApi, teamsApi } from '../api/client'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorDisplay from '../components/common/ErrorDisplay'
import { useToast } from '../components/common/Toast'

const MODES = ['passive', 'balanced', 'aggressive']
const MODE_STYLE = {
  passive: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  balanced: 'bg-card text-text-muted border-border',
  aggressive: 'bg-red-500/15 text-red-400 border-red-500/40',
}

const LOW_ENERGY = 40
const LOW_CONDITION = 50

const formatGC = (n) => `₵${Math.round(Number(n) || 0).toLocaleString()}`

/**
 * Cyborg Garage - manage the user-controlled team: bank balance, 7-player
 * squad (5 active + 2 spares), player modes, energy, repairs and upgrades,
 * plus the pre-match lineup panel and the latest post-match reward summary.
 */
export default function Garage() {
  const [garage, setGarage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pendingActive, setPendingActive] = useState(null) // Set of playerIds while editing
  const [busy, setBusy] = useState(false)
  const [teams, setTeams] = useState([])
  const { addToast } = useToast()

  useEffect(() => {
    teamsApi.getAll()
      .then(({ data }) => setTeams(data))
      .catch(() => {}) // picker just stays empty
  }, [])

  const load = useCallback(async () => {
    try {
      const data = await garageApi.getGarage()
      setGarage(data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load garage')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000) // matches finish in the background
    return () => clearInterval(interval)
  }, [load])

  // Wrap any garage action: run it, toast errors, reload state.
  const run = async (action, successMessage) => {
    setBusy(true)
    try {
      await action()
      if (successMessage) addToast(successMessage, 'info', 3000)
      await load()
    } catch (err) {
      addToast(err.response?.data?.error || 'Action failed', 'error', 4000)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorDisplay message={error} onRetry={load} />
  if (!garage) return <ErrorDisplay message="Garage not initialised yet" onRetry={load} />

  const { squad, balance, teamName, nextFixture, lastResult, prices } = garage
  const activeIds = pendingActive ?? new Set(squad.filter(p => p.isActive).map(p => p.playerId))
  const editing = pendingActive !== null

  const toggleActive = (playerId) => {
    const next = new Set(activeIds)
    if (next.has(playerId)) next.delete(playerId)
    else if (next.size < garage.activeSize) next.add(playerId)
    setPendingActive(next)
  }

  const saveLineup = () => run(
    () => garageApi.setLineup([...activeIds]).then(() => setPendingActive(null)),
    '✅ Lineup saved'
  )

  const activePlayers = squad.filter(p => activeIds.has(p.playerId))
  const warnings = activePlayers.flatMap(p => [
    ...(p.energy < LOW_ENERGY ? [`${p.name} is low on energy (${p.energy})`] : []),
    ...(p.condition < LOW_CONDITION ? [`${p.name} is badly damaged (condition ${p.condition})`] : []),
  ])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header: team + bank balance */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>🔧</span>
            <span className="text-gradient">Cyborg Garage</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {teams.length > 0 ? (
              <select
                value={garage.teamId}
                disabled={busy}
                onChange={(e) => {
                  const team = teams.find(t => t.team_id === Number(e.target.value))
                  if (!team || team.team_id === garage.teamId) return
                  if (window.confirm(`Take over the garage for ${team.team_name}? Your credits stay with you.`)) {
                    run(() => garageApi.setTeam(team.team_id).then(() => setPendingActive(null)),
                      `🔧 Now running ${team.team_name}`)
                  }
                }}
                className="bg-card border border-border rounded-lg text-sm px-2 py-1 text-text"
              >
                {teams.map(t => (
                  <option key={t.team_id} value={t.team_id}>{t.team_name}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-text-muted">{teamName}</span>
            )}
            <span className="text-sm text-text-muted">· {garage.stadiumSize} stadium</span>
          </div>
        </div>
        <div className="px-4 py-2 rounded-xl bg-card border border-border">
          <div className="text-xs text-text-muted">Bank</div>
          <div className="text-xl font-mono font-bold text-primary">{formatGC(balance)}</div>
        </div>
      </div>

      {/* Pre-match panel */}
      <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Next match</h2>
        {nextFixture ? (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-semibold">
                  {nextFixture.userIsHome ? 'vs' : '@'} {nextFixture.opponent.name}
                  {nextFixture.status === 'live' && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-live/20 text-live text-xs animate-pulse">LIVE</span>
                  )}
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {nextFixture.round} · {nextFixture.userIsHome ? 'Home' : 'Away'} · {nextFixture.stadiumSize} stadium
                </div>
              </div>
              <div className="text-xs text-text-muted">
                Active: {activePlayers.map(p => p.name).join(', ')}
              </div>
            </div>
            {warnings.length > 0 && (
              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs p-3 space-y-1">
                {warnings.map(w => <div key={w}>⚠️ {w}</div>)}
              </div>
            )}
            {editing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={saveLineup}
                  disabled={busy || activeIds.size !== garage.activeSize}
                  className="px-4 py-2 rounded-xl bg-primary text-bg text-sm font-semibold disabled:opacity-40"
                >
                  Confirm lineup ({activeIds.size}/{garage.activeSize})
                </button>
                <button
                  onClick={() => setPendingActive(null)}
                  className="px-4 py-2 rounded-xl border border-border text-sm text-text-muted"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="text-xs text-text-muted">
                Lineup locked in — tap a player card below to change who starts.
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-text-muted">No upcoming fixture — waiting for the next cup draw.</p>
        )}
      </section>

      {/* Squad */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
            Squad ({squad.length}) · {garage.activeSize} active + {squad.length - garage.activeSize} spares
          </h2>
          <button
            onClick={() => run(() => garageApi.buyEnergy({ pack: 'full' }), '⚡ Full squad recharged')}
            disabled={busy || balance < prices.energyFull.cost}
            className="px-3 py-1.5 rounded-xl border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/10 disabled:opacity-40"
          >
            ⚡ Full recharge ({formatGC(prices.energyFull.cost)})
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {squad.map(player => (
            <PlayerCard
              key={player.playerId}
              player={player}
              isActive={activeIds.has(player.playerId)}
              balance={balance}
              prices={prices}
              busy={busy}
              onToggleActive={() => toggleActive(player.playerId)}
              onSetMode={(mode) => run(() => garageApi.setPlayerMode(player.playerId, mode))}
              onBuyEnergy={() => run(
                () => garageApi.buyEnergy({ pack: 'small', playerId: player.playerId }),
                `⚡ +${prices.energySmall.amount} energy for ${player.name}`
              )}
              onRepair={() => run(
                () => garageApi.repairPlayer(player.playerId),
                `🔩 ${player.name} repaired`
              )}
              onUpgrade={(stat) => run(
                () => garageApi.upgradePlayer(player.playerId, stat),
                `📈 ${player.name} ${stat} upgraded`
              )}
            />
          ))}
        </div>
      </section>

      {/* Post-match reward summary */}
      {lastResult && <RewardSummary result={lastResult} />}
    </div>
  )
}

function StatBar({ label, value, warnBelow }) {
  const color = value < warnBelow ? 'bg-red-500' : value < warnBelow + 25 ? 'bg-yellow-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-text-muted">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-7 text-right font-mono">{value}</span>
    </div>
  )
}

function PlayerCard({ player, isActive, balance, prices, busy, onToggleActive, onSetMode, onBuyEnergy, onRepair, onUpgrade }) {
  const stats = [
    { key: 'attack', label: 'ATK', value: player.attack },
    { key: 'defence', label: 'DEF', value: player.defense },
    { key: 'speed', label: 'SPD', value: player.speed },
  ]

  return (
    <div className={`rounded-2xl border p-4 space-y-3 transition-colors ${
      isActive ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <button onClick={onToggleActive} disabled={busy} className="text-left">
          <div className="font-semibold flex items-center gap-2">
            {player.name}
            {player.isGoalkeeper && <span className="text-xs text-text-muted">🧤 GK</span>}
          </div>
          <div className={`text-xs mt-0.5 ${isActive ? 'text-primary' : 'text-text-muted'}`}>
            {isActive ? '● Active' : '○ Spare'} — tap to change
          </div>
        </button>
        <div className="flex gap-1">
          {MODES.map(mode => (
            <button
              key={mode}
              onClick={() => mode !== player.mode && onSetMode(mode)}
              disabled={busy}
              title={mode}
              className={`px-2 py-1 rounded-lg border text-[10px] uppercase font-semibold transition-colors ${
                player.mode === mode ? MODE_STYLE[mode] : 'border-transparent text-text-muted/50 hover:text-text-muted'
              }`}
            >
              {mode.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Upgradable stats */}
      <div className="grid grid-cols-3 gap-2">
        {stats.map(({ key, label, value }) => {
          const cost = player.upgradeCosts?.[key] ?? 0
          return (
            <button
              key={key}
              onClick={() => onUpgrade(key)}
              disabled={busy || balance < cost || value >= 99}
              className="rounded-xl border border-border p-2 text-center hover:border-primary/40 disabled:opacity-40 transition-colors"
              title={`Upgrade ${key} (+1) for ${formatGC(cost)}`}
            >
              <div className="text-[10px] text-text-muted">{label}</div>
              <div className="font-mono font-bold">{value}</div>
              <div className="text-[10px] text-primary">+1 {formatGC(cost)}</div>
            </button>
          )
        })}
      </div>

      {/* Energy + condition */}
      <div className="space-y-1.5">
        <StatBar label="Energy" value={player.energy} warnBelow={LOW_ENERGY} />
        <StatBar label="Condition" value={player.condition} warnBelow={LOW_CONDITION} />
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBuyEnergy}
          disabled={busy || player.energy >= 100 || balance < prices.energySmall.cost}
          className="flex-1 px-2 py-1.5 rounded-xl border border-border text-xs hover:border-primary/40 disabled:opacity-40"
        >
          ⚡ +{prices.energySmall.amount} ({formatGC(prices.energySmall.cost)})
        </button>
        <button
          onClick={onRepair}
          disabled={busy || player.condition >= 100 || balance < player.repairCost}
          className="flex-1 px-2 py-1.5 rounded-xl border border-border text-xs hover:border-primary/40 disabled:opacity-40"
        >
          🔩 Repair ({formatGC(player.repairCost)})
        </button>
      </div>
    </div>
  )
}

function RewardSummary({ result }) {
  const rows = [
    { label: 'Base round reward', value: result.breakdown?.base },
    { label: `Opponent tier bonus${result.breakdown?.opponentGrade ? ` (${result.breakdown.opponentGrade})` : ''}`, value: result.breakdown?.tierBonus },
    { label: 'Upset bonus', value: result.breakdown?.upsetBonus },
    { label: 'Stadium bonus', value: result.breakdown?.stadiumBonus },
    { label: 'History bonus', value: result.breakdown?.historyBonus },
  ].filter(r => r.value > 0)

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Last match</h2>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">
            {result.homeName} {result.score.home}–{result.score.away} {result.awayName}
            {result.penaltyScore && (
              <span className="text-text-muted text-sm"> (pens {result.penaltyScore.home}–{result.penaltyScore.away})</span>
            )}
          </div>
          <div className="text-xs text-text-muted mt-0.5">{result.round}</div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
          result.won ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
        }`}>
          {result.won ? 'WON' : 'LOST'}
        </div>
      </div>

      {result.won && rows.length > 0 && (
        <div className="rounded-xl border border-border divide-y divide-border text-sm">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between px-3 py-2">
              <span className="text-text-muted">{label}</span>
              <span className="font-mono">{formatGC(value)}</span>
            </div>
          ))}
          <div className="flex justify-between px-3 py-2 font-semibold">
            <span>Total earned</span>
            <span className="font-mono text-primary">{formatGC(result.rewardTotal)}</span>
          </div>
        </div>
      )}

      {Array.isArray(result.playerChanges) && result.playerChanges.length > 0 && (
        <div>
          <div className="text-xs text-text-muted mb-1">Squad wear from this match</div>
          <div className="rounded-xl border border-border divide-y divide-border text-xs">
            {result.playerChanges.map(change => (
              <div key={change.playerId} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>{change.name} <span className="text-text-muted">({change.mode})</span></span>
                <span className="font-mono text-text-muted">
                  ⚡ {change.energyBefore}→{change.energyAfter} · 🛠 {change.conditionBefore}→{change.conditionAfter}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
