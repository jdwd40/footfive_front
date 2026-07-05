import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../stores/useAuthStore'
import { walletApi } from '../api/client'
import { formatFC } from '../utils/betting'
import { useToast } from '../components/common/Toast'

const TOPUP_AMOUNTS = [100, 500, 1000]

export default function Account() {
  const { token, user } = useAuthStore()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {token && user ? <Profile /> : <AuthForm />}
    </div>
  )
}

// === Login / Register ===

function AuthForm() {
  const { login, register, isAuthLoading } = useAuthStore()
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const { addToast } = useToast()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      if (mode === 'login') {
        await login(username, password)
        addToast('⚡ Welcome back!', 'info', 3000)
      } else {
        await register(username, password)
        addToast('🎉 Account created — 1,000 FC starting credits added!', 'info', 5000)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center text-3xl shadow-lg shadow-primary/20">
          🎫
        </div>
        <h1 className="text-3xl font-bold mb-2">
          <span className="text-gradient">Punter</span>
          <span className="text-text"> Access</span>
        </h1>
        <p className="text-text-muted text-sm">
          Bet virtual FootFive Credits on cup matches.
        </p>
        <p className="text-accent text-xs uppercase tracking-wider mt-1">
          Virtual test money only — no real funds
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl bg-card border border-border p-1 mb-6">
        {['login', 'register'].map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide transition-all ${
              mode === m ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
            }`}
          >
            {m === 'login' ? 'Login' : 'Register'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm text-text-muted mb-1.5">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="3-20 characters"
            className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-text-muted mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
            className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text focus:border-primary focus:outline-none"
          />
        </div>

        {error && (
          <p className="text-live text-sm p-2 rounded-lg bg-live/10 border border-live/20">{error}</p>
        )}

        <button
          type="submit"
          disabled={isAuthLoading || !username || !password}
          className="btn btn-primary w-full disabled:opacity-40"
        >
          {isAuthLoading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
        </button>

        {mode === 'register' && (
          <p className="text-xs text-text-muted text-center">
            New accounts start with 1,000 FC of virtual credits.
          </p>
        )}
      </form>
    </div>
  )
}

// === Logged-in profile + wallet ===

function Profile() {
  const { user, balance, logout, refreshWallet, setBalance } = useAuthStore()
  const [transactions, setTransactions] = useState([])
  const [topupBusy, setTopupBusy] = useState(false)
  const { addToast } = useToast()

  const loadTransactions = useCallback(async () => {
    try {
      const data = await walletApi.getTransactions(15)
      setTransactions(data.transactions || [])
    } catch {
      setTransactions([])
    }
  }, [])

  useEffect(() => {
    refreshWallet()
    loadTransactions()
  }, [refreshWallet, loadTransactions])

  const handleTopup = async (amount) => {
    setTopupBusy(true)
    try {
      const data = await walletApi.addDummyFunds(amount)
      setBalance(data.wallet.balance)
      addToast(`💰 Added ${formatFC(amount)} dummy funds`, 'info', 3000)
      loadTransactions()
    } catch (err) {
      addToast(err.response?.data?.error || 'Top-up failed', 'error', 4000)
    } finally {
      setTopupBusy(false)
    }
  }

  return (
    <div>
      {/* Profile header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center text-2xl">
            🕶️
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">{user.username}</h1>
            <p className="text-xs text-text-muted">Virtual punter account</p>
          </div>
        </div>
        <button onClick={logout} className="btn btn-ghost text-sm">
          Logout
        </button>
      </div>

      {/* Wallet card */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs uppercase tracking-wider text-text-muted">Wallet Balance</p>
          <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-bold uppercase">
            Virtual only
          </span>
        </div>
        <p className="text-4xl font-bold font-mono text-primary mb-4">{formatFC(balance)}</p>

        <p className="text-xs text-text-muted mb-2">Add dummy funds for testing:</p>
        <div className="flex gap-2">
          {TOPUP_AMOUNTS.map((amount) => (
            <button
              key={amount}
              onClick={() => handleTopup(amount)}
              disabled={topupBusy}
              className="flex-1 py-2 rounded-xl bg-primary/15 text-primary text-sm font-bold hover:bg-primary/25 transition-colors disabled:opacity-40"
            >
              +{amount} FC
            </button>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link to="/bets" className="card card-hover text-center py-4">
          <span className="text-2xl block mb-1">🎫</span>
          <span className="text-sm font-semibold text-text">My Bets</span>
        </Link>
        <Link to="/fixtures" className="card card-hover text-center py-4">
          <span className="text-2xl block mb-1">📅</span>
          <span className="text-sm font-semibold text-text">Fixtures</span>
        </Link>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-3">
          Recent Transactions
        </h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-text-muted py-2">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.transactionId} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm text-text truncate">{describeTransaction(tx)}</p>
                  <p className="text-[11px] text-text-muted">{formatDate(tx.createdAt)}</p>
                </div>
                <span className={`text-sm font-mono font-bold whitespace-nowrap ml-3 ${tx.amount >= 0 ? 'text-primary' : 'text-live'}`}>
                  {tx.amount >= 0 ? '+' : ''}{formatFC(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function describeTransaction(tx) {
  const labels = {
    dummy_funds: '💰 Dummy funds added',
    bet_stake: '🎫 Bet stake',
    bet_payout: '🏆 Bet winnings',
    bet_refund: '↩️ Bet refund',
  }
  return labels[tx.transactionType] || tx.description || tx.transactionType
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}
