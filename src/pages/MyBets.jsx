import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../stores/useAuthStore'
import { bettingApi } from '../api/client'
import { formatFC, formatOdds, BET_STATUS_STYLES, BET_TYPE_LABELS } from '../utils/betting'
import LoadingSpinner from '../components/common/LoadingSpinner'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'void', label: 'Void' },
]

export default function MyBets() {
  const { token, refreshWallet } = useAuthStore()
  const [bets, setBets] = useState([])
  const [summary, setSummary] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const [betsData, summaryData] = await Promise.all([
        bettingApi.getMyBets(),
        bettingApi.getSummary(),
      ])
      setBets(betsData.bets || [])
      setSummary(summaryData.summary || null)
    } catch {
      /* keep last data */
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
    refreshWallet()
    // Refresh periodically so settled bets appear without a manual reload
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [loadData, refreshWallet])

  if (!token) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <span className="text-5xl block mb-4">🎫</span>
        <h1 className="text-2xl font-bold text-text mb-2">My Bets</h1>
        <p className="text-text-muted mb-6">Sign in to see your virtual bets.</p>
        <Link to="/account" className="btn btn-primary">Login / Register</Link>
      </div>
    )
  }

  const filteredBets = filter === 'all' ? bets : bets.filter((b) => b.status === filter)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🎫</span>
        <div>
          <h1 className="text-2xl font-bold text-text">My Bets</h1>
          <p className="text-xs text-accent uppercase tracking-wider">Virtual credits only</p>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-4 gap-2 mb-6">
          <SummaryStat label="Pending" value={summary.pending} accent="text-amber-400" />
          <SummaryStat label="Won" value={summary.won} accent="text-primary" />
          <SummaryStat label="Lost" value={summary.lost} accent="text-live" />
          <SummaryStat label="Staked" value={formatFC(summary.totalStaked)} accent="text-text" small />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition-colors ${
              filter === key ? 'bg-primary text-bg' : 'bg-card text-text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bet list */}
      {loading ? (
        <div className="text-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredBets.length === 0 ? (
        <div className="card text-center py-10">
          <span className="text-4xl block mb-3">🤷</span>
          <p className="text-text-muted mb-4">
            {filter === 'all' ? 'No bets yet. Head to the fixtures to place one!' : `No ${filter} bets.`}
          </p>
          {filter === 'all' && (
            <Link to="/fixtures" className="btn btn-primary">Browse Fixtures</Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBets.map((bet) => <BetCard key={bet.betId} bet={bet} />)}
        </div>
      )}
    </div>
  )
}

function SummaryStat({ label, value, accent, small }) {
  return (
    <div className="bg-card rounded-xl border border-border p-2.5 text-center">
      <p className={`font-bold ${small ? 'text-xs font-mono' : 'text-lg'} ${accent}`}>{value}</p>
      <p className="text-[10px] text-text-muted uppercase tracking-wide">{label}</p>
    </div>
  )
}

function BetCard({ bet }) {
  const statusStyle = BET_STATUS_STYLES[bet.status] || BET_STATUS_STYLES.pending
  const isChampionship = bet.betType === 'championship_winner'

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted px-1.5 py-0.5 rounded bg-card-hover">
              {BET_TYPE_LABELS[bet.betType] || bet.betType}
            </span>
            {bet.fixture?.round && (
              <span className="text-[10px] text-text-muted">{bet.fixture.round}</span>
            )}
          </div>
          <p className="font-semibold text-text truncate">
            {isChampionship ? '👑 ' : ''}{bet.selectedTeamName}
          </p>
          {bet.fixture && (
            <p className="text-xs text-text-muted truncate">
              {bet.fixture.homeTeamName} vs {bet.fixture.awayTeamName}
            </p>
          )}
        </div>
        <span className={`px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${statusStyle.className}`}>
          {statusStyle.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center bg-card-hover/40 rounded-xl p-2">
        <div>
          <p className="text-[10px] text-text-muted uppercase">Stake</p>
          <p className="text-sm font-mono font-bold text-text">{formatFC(bet.stake)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Odds</p>
          <p className="text-sm font-mono font-bold text-text">{formatOdds(bet.oddsAtPlacement)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">
            {bet.status === 'won' ? 'Returned' : 'Potential'}
          </p>
          <p className={`text-sm font-mono font-bold ${bet.status === 'won' ? 'text-primary' : bet.status === 'lost' ? 'text-text-muted line-through' : 'text-text'}`}>
            {formatFC(bet.potentialReturn)}
          </p>
        </div>
      </div>

      {bet.settlementNote && (
        <p className="text-[11px] text-text-muted mt-2">{bet.settlementNote}</p>
      )}
    </div>
  )
}
