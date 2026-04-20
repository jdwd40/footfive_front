import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fixturesApi, teamsApi, liveApi } from '../api/client'
import TeamCard from '../components/teams/TeamCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { SkeletonList } from '../components/common/SkeletonCard'
import { formatRating } from '../utils/formatters'
import { isTournamentPlayingState } from '../utils/tournamentPhases'

// Tournament state labels for display
const TOURNAMENT_STATE_LABELS = {
  IDLE: 'Waiting',
  SETUP: 'Starting',
  ROUND_ACTIVE: 'Live',
  ROUND_COMPLETE: 'Round done',
  INTER_ROUND_DELAY: 'Break',
  ROUND_OF_16: 'Round of 16',
  QF_BREAK: 'QF Starting',
  QUARTER_FINALS: 'Quarter-Finals',
  SF_BREAK: 'SF Starting',
  SEMI_FINALS: 'Semi-Finals',
  FINAL_BREAK: 'Final Starting',
  FINAL: 'THE FINAL',
  RESULTS: 'Complete',
  COMPLETE: 'Complete',
}

export default function Home() {
  const [topTeams, setTopTeams] = useState([])
  const [liveStatus, setLiveStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [teamsRes, statusRes] = await Promise.all([
          teamsApi.getTop16().catch(() => ({ data: [] })),
          liveApi.getStatus().catch(() => null)
        ])

        // Sort teams by cups won
        const sortedTeams = (teamsRes.data || []).sort((a, b) => (b.cups_won || 0) - (a.cups_won || 0))
        setTopTeams(sortedTeams.slice(0, 8))
        setLiveStatus(statusRes)
      } catch (error) {
        console.error('Failed to fetch home data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    
    // Refresh status every 30 seconds
    const interval = setInterval(async () => {
      try {
        const statusRes = await liveApi.getStatus()
        setLiveStatus(statusRes)
      } catch (e) {}
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  const isLive = isTournamentPlayingState(liveStatus?.tournament?.state)

  const isPaused = liveStatus?.simulation?.isPaused === true
  const tournamentIdle = !liveStatus?.tournament?.state || 
    ['IDLE', 'COMPLETE', 'RESULTS'].includes(liveStatus.tournament.state)
  const canStartTournament = tournamentIdle && !starting

  const handleStartTournament = async () => {
    if (!canStartTournament) return
    setStarting(true)
    setStartError(null)
    try {
      await liveApi.startTournament()
      // Refresh status after starting
      const statusRes = await liveApi.getStatus()
      setLiveStatus(statusRes)
    } catch (error) {
      console.error('Failed to start tournament:', error)
      
      // Enhanced error handling with detailed information
      const status = error.response?.status
      const responseData = error.response?.data
      const requestUrl = error.config?.url || error.request?.responseURL || 'Unknown URL'
      
      let errorMessage = 'Failed to start tournament'
      
      if (status === 404) {
        errorMessage = 'Tournament start endpoint not found. Please check if the backend is running and the route exists.'
      } else if (status === 400) {
        const backendMessage = responseData?.error || responseData?.message
        if (backendMessage?.includes('Simulation not initialized')) {
          errorMessage = 'Simulation not initialized. The simulation loop needs to be started first.'
        } else if (backendMessage?.includes('already in progress')) {
          errorMessage = 'A tournament is already in progress.'
        } else {
          errorMessage = backendMessage || 'Bad request. Please check tournament state.'
        }
      } else if (status === 500) {
        errorMessage = responseData?.error || responseData?.message || 'Server error occurred. Please try again later.'
      } else if (!error.response) {
        // Network error (no response received)
        if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
          errorMessage = 'Cannot connect to server. Please check if the backend is running.'
        } else {
          errorMessage = `Network error: ${error.message || 'Unable to reach server'}`
        }
      } else {
        // Other HTTP errors
        errorMessage = responseData?.error || responseData?.message || error.message || `Error ${status}: Failed to start tournament`
      }
      
      // Log full error details for debugging
      console.error('[handleStartTournament] Full error details:', {
        status,
        statusText: error.response?.statusText,
        responseData,
        requestUrl,
        message: error.message,
        code: error.code,
        config: error.config
      })
      
      setStartError(errorMessage)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12 animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-primary to-primary-dark shadow-2xl shadow-primary/30">
          <span className="text-5xl">⚽</span>
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold mb-4 tracking-tight">
          <span className="text-gradient">Foot</span>
          <span className="text-text">Five</span>
        </h1>
        <p className="text-text-muted text-lg max-w-2xl mx-auto">
          Live 5-a-side knockout tournaments with real-time scores, instant updates, and comprehensive team stats
        </p>
      </div>

      {/* Live Tournament Status Card */}
      <div className="mb-10">
        <Link to="/live">
          <div className={`
            relative overflow-hidden rounded-3xl p-6 sm:p-8 transition-all duration-300
            ${isLive 
              ? 'bg-gradient-to-br from-live/10 via-card to-live/5 border border-live/30 shadow-xl shadow-live/10' 
              : 'bg-gradient-to-br from-primary/10 via-card to-gold/5 border border-border hover:border-primary/30'}
          `}>
            {/* Animated background for live state */}
            {isLive && (
              <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-live/20 to-transparent animate-pulse" />
              </div>
            )}

            <div className="relative flex flex-col md:flex-row items-center gap-6">
              {/* Icon */}
              <div className={`
                w-24 h-24 rounded-2xl flex items-center justify-center text-5xl shadow-xl
                ${isLive 
                  ? 'bg-gradient-to-br from-live/30 to-live/10 shadow-live/20' 
                  : 'bg-gradient-to-br from-gold/30 to-primary/20 shadow-gold/20'}
              `}>
                {isLive ? '🔴' : '🏆'}
              </div>

              {/* Content */}
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                  <h2 className="text-2xl sm:text-3xl font-bold text-text">
                    {isLive ? 'Live Now!' : 'Live Tournament'}
                  </h2>
                  {isLive && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-live/20 border border-live/30">
                      <span className="w-2 h-2 rounded-full bg-live animate-pulse" />
                      <span className="text-sm font-bold text-live">LIVE</span>
                    </span>
                  )}
                </div>
                
                {liveStatus?.tournament ? (
                  <div className="space-y-2">
                    {liveStatus.tournament.state === 'IDLE' ? (
                      <p className="text-text-muted">
                        Next tournament starts 5 minutes after the previous one finishes
                      </p>
                    ) : liveStatus.tournament.state === 'COMPLETE' || liveStatus.tournament.state === 'RESULTS' ? (
                      <div className="flex items-center justify-center md:justify-start gap-2">
                        {liveStatus.tournament.winner && (
                          <span className="flex items-center gap-2">
                            <span className="text-gold">🏆</span>
                            <span className="text-primary font-semibold">
                              {liveStatus.tournament.winner.name || liveStatus.tournament.winner}
                            </span>
                            <span className="text-text-muted">won!</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                        <span className="px-3 py-1 rounded-lg bg-accent/20 text-accent font-semibold text-sm">
                          {TOURNAMENT_STATE_LABELS[liveStatus.tournament.state] || liveStatus.tournament.state}
                        </span>
                        {liveStatus.tournament.activeMatches > 0 && (
                          <span className="text-text-muted">
                            {liveStatus.tournament.activeMatches} matches in progress
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-text-muted">
                    Watch live tournaments with real-time scores and events
                  </p>
                )}
              </div>

              {/* CTA Button */}
              <div className={`
                btn font-bold
                ${isLive ? 'bg-live text-white shadow-lg shadow-live/30' : 'btn-primary'}
              `}>
                {isLive ? 'Watch Live →' : 'View Tournament →'}
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Start Tournament Button */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <button
          onClick={handleStartTournament}
          disabled={!canStartTournament}
          className={`
            relative px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300
            ${canStartTournament
              ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40 hover:scale-105 cursor-pointer active:scale-95'
              : 'bg-gray-700/50 text-gray-500 border border-gray-600/30 cursor-not-allowed'}
          `}
        >
          <span className="flex items-center gap-3">
            {starting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Starting...
              </>
            ) : (
              <>
                🏆 Start Tournament
              </>
            )}
          </span>
        </button>
        {!tournamentIdle && liveStatus && (
          <p className="text-sm text-text-muted">
            A tournament is already in progress
          </p>
        )}
        {startError && (
          <p className="text-sm text-live font-medium">
            {startError}
          </p>
        )}
      </div>

      {/* Quick Stats Summary */}
      {topTeams.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <QuickStatCard 
            icon="👥" 
            value={topTeams.length * 2} 
            label="Teams" 
          />
          <QuickStatCard 
            icon="🏆" 
            value={topTeams.reduce((sum, t) => sum + (t.cups_won || 0), 0)} 
            label="Tournaments" 
          />
          <QuickStatCard 
            icon="⚽" 
            value={topTeams.reduce((sum, t) => sum + (t.goals_for || 0), 0)} 
            label="Goals" 
          />
          <QuickStatCard 
            icon="🎯" 
            value={topTeams.reduce((sum, t) => sum + (t.wins || 0), 0)} 
            label="Matches Won" 
          />
        </div>
      )}

      {/* Top Teams */}
      <Section 
        title="🏆 Hall of Fame" 
        subtitle="Teams with the most tournament wins"
        link="/teams"
        className="mb-10"
      >
        {loading ? (
          <SkeletonList count={4} type="team" />
        ) : topTeams.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {topTeams.map((team, index) => (
              <div 
                key={team.team_name} 
                className="animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <TeamCard team={team} rank={index + 1} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No teams found" />
        )}
      </Section>

      {/* Quick Navigation */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLinkCard
          to="/live"
          icon="🔴"
          title="Live Tournament"
          description="Watch matches unfold in real-time with live scores"
          color="from-live/20 to-live/5"
        />
        <QuickLinkCard
          to="/teams"
          icon="📊"
          title="Team Statistics"
          description="View all-time stats, ratings, and performance"
          color="from-primary/20 to-primary/5"
        />
        <QuickLinkCard
          to="/fixtures"
          icon="📅"
          title="Match History"
          description="Browse all completed fixtures and results"
          color="from-accent/20 to-accent/5"
        />
      </div>
    </div>
  )
}

function QuickStatCard({ icon, value, label }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 text-center">
      <span className="text-2xl mb-2 block">{icon}</span>
      <p className="text-2xl font-bold text-text">{value.toLocaleString()}</p>
      <p className="text-sm text-text-muted">{label}</p>
    </div>
  )
}

function Section({ title, subtitle, link, children, className = '' }) {
  return (
    <section className={className}>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-text">{title}</h2>
          {subtitle && <p className="text-text-muted text-sm mt-1">{subtitle}</p>}
        </div>
        {link && (
          <Link 
            to={link} 
            className="text-sm text-primary hover:text-primary-light transition-colors font-medium"
          >
            View All →
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-12 text-text-muted card">
      <p>{message}</p>
    </div>
  )
}

function QuickLinkCard({ to, icon, title, description, color }) {
  return (
    <Link to={to}>
      <div className={`
        card card-hover h-full bg-gradient-to-br ${color}
      `}>
        <span className="text-4xl mb-4 block">{icon}</span>
        <h3 className="font-bold text-text text-lg mb-2">{title}</h3>
        <p className="text-sm text-text-muted">{description}</p>
      </div>
    </Link>
  )
}
