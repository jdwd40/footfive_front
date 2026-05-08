import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fixturesApi } from '../api/client'
import MatchClock from '../components/live/MatchClock'
import LiveScore from '../components/live/LiveScore'
import EventFeed from '../components/live/EventFeed'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorDisplay from '../components/common/ErrorDisplay'
import { useToast } from '../components/common/Toast'

const POLL_INTERVAL = 500 // 500ms as per plan

export default function LiveMatch() {
  const { id } = useParams()
  const { addToast } = useToast()
  
  const [fixture, setFixture] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isLive, setIsLive] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  
  const lastEventIdRef = useRef(0)
  const pollIntervalRef = useRef(null)

  // Initial load
  useEffect(() => {
    initMatch()
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [id])

  // Polling effect
  useEffect(() => {
    if (!isLive || loading) return

    pollIntervalRef.current = setInterval(pollEvents, POLL_INTERVAL)
    setConnectionStatus('connected')

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [isLive, loading, id])

  const initMatch = async () => {
    setLoading(true)
    setError(null)
    setConnectionStatus('connecting')
    
    try {
      const [fixtureRes, eventsRes] = await Promise.all([
        fixturesApi.getById(id),
        fixturesApi.getEvents(id)
      ])

      const fixtureData = fixtureRes.data
      const eventsData = eventsRes.data || []

      setFixture(fixtureData)
      setEvents(eventsData)
      
      if (eventsData.length > 0) {
        lastEventIdRef.current = eventsData[eventsData.length - 1].event_id
      }

      // Check if match is still live
      const isMatchLive = fixtureData.status === 'live'
      const hasEnded = eventsData.some(e => 
        ['fulltime', 'shootout_end'].includes(e.event_type)
      )
      
      setIsLive(isMatchLive && !hasEnded)
      setConnectionStatus(isMatchLive && !hasEnded ? 'connected' : 'ended')
    } catch (err) {
      setError(err.message)
      setConnectionStatus('error')
    } finally {
      setLoading(false)
    }
  }

  const pollEvents = useCallback(async () => {
    try {
      const { data } = await fixturesApi.getEvents(id, lastEventIdRef.current)
      
      if (data && data.length > 0) {
        setEvents(prev => [...prev, ...data])
        lastEventIdRef.current = data[data.length - 1].event_id

        // Check for goals and notify
        data.forEach(event => {
          if (event.event_type === 'goal' || event.event_type === 'penalty_goal') {
            addToast(
              `⚽ GOAL! ${event.player_name || ''} - ${event.team_name}`,
              'goal',
              5000
            )
          }
        })

        // Check for match end
        const endEvents = ['fulltime', 'shootout_end']
        if (data.some(e => endEvents.includes(e.event_type))) {
          setIsLive(false)
          setConnectionStatus('ended')
          addToast('Match has ended!', 'info', 5000)
        }
      }
    } catch (err) {
      console.error('Poll error:', err)
      setConnectionStatus('error')
    }
  }, [id, addToast])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <LoadingSpinner size="lg" className="mb-4" />
          <p className="text-text-muted">Connecting to match...</p>
        </div>
      </div>
    )
  }

  if (error || !fixture) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ErrorDisplay message={error || 'Match not found'} onRetry={initMatch} />
        <div className="text-center mt-4">
          <Link to="/fixtures" className="text-primary hover:underline">
            ← Back to Fixtures
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link 
          to={`/fixtures/${id}`}
          className="inline-flex items-center gap-2 text-text-muted hover:text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Match Details
        </Link>
        
        <ConnectionIndicator status={connectionStatus} />
      </div>

      {/* Match Card */}
      <div className={`card mb-6 ${isLive ? 'border-primary/50 shadow-xl shadow-primary/20' : ''}`}>
        {/* Tournament Info */}
        {fixture.tournament_name && (
          <div className="text-center mb-4">
            <span className="px-3 py-1 bg-card-hover rounded-lg text-sm text-text-muted">
              {fixture.tournament_name}
              {fixture.round_number && ` • Round ${fixture.round_number}`}
            </span>
          </div>
        )}

        {/* Clock */}
        <MatchClock events={events} isLive={isLive} />

        {/* Score */}
        <LiveScore fixture={fixture} events={events} />
      </div>

      {/* Event Feed */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text">Live Events</h3>
          {isLive && (
            <span className="flex items-center gap-2 text-sm text-text-muted">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Auto-updating
            </span>
          )}
        </div>
        <EventFeed
          events={events}
          homeTeam={fixture.home_team}
          awayTeam={fixture.away_team}
          homeTeamId={fixture.home_team_id}
          awayTeamId={fixture.away_team_id}
          autoScroll={isLive}
        />
      </div>

      {/* Match Ended Message */}
      {!isLive && events.length > 0 && (
        <div className="mt-6 p-4 bg-card rounded-xl border border-border text-center">
          <p className="text-text-muted">
            Match has ended.{' '}
            <Link to={`/fixtures/${id}`} className="text-primary hover:underline">
              View full match report →
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}

function ConnectionIndicator({ status }) {
  const statusConfig = {
    connecting: { color: 'bg-yellow-500', text: 'Connecting...', animate: true },
    connected: { color: 'bg-green-500', text: 'Live', animate: true },
    ended: { color: 'bg-gray-500', text: 'Ended', animate: false },
    error: { color: 'bg-red-500', text: 'Connection Error', animate: false },
  }

  const config = statusConfig[status] || statusConfig.connecting

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-2 h-2 rounded-full ${config.color} ${config.animate ? 'animate-pulse' : ''}`} />
      <span className="text-text-muted">{config.text}</span>
    </div>
  )
}

