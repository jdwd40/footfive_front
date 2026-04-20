import { useState, useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { liveApi } from '../../api/client'
import { isTournamentPlayingState } from '../../utils/tournamentPhases'

const navLinks = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/live', label: 'Live', highlight: true, icon: '🔴' },
  { to: '/teams', label: 'Teams', icon: '👥' },
  { to: '/fixtures', label: 'Fixtures', icon: '📅' },
]

export default function Navbar() {
  const [isLive, setIsLive] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Check if tournament is live
  useEffect(() => {
    const checkLiveStatus = async () => {
      try {
        const status = await liveApi.getStatus()
        setIsLive(isTournamentPlayingState(status?.tournament?.state))
      } catch (e) {}
    }
    
    checkLiveStatus()
    const interval = setInterval(checkLiveStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <nav className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-all group-hover:scale-105">
              <span className="text-2xl">⚽</span>
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="text-gradient">Foot</span>
              <span className="text-text">Five</span>
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden sm:flex items-center gap-1">
            {navLinks.map(({ to, label, highlight, icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-primary/20 text-primary'
                      : highlight && isLive
                        ? 'text-live hover:bg-live/10'
                        : highlight
                          ? 'text-primary hover:bg-primary/10'
                          : 'text-text-muted hover:text-text hover:bg-card'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-2">
                      {highlight && isLive && (
                        <span className="w-2 h-2 rounded-full bg-live animate-pulse" />
                      )}
                      {label}
                    </span>
                    {isActive && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden p-2 rounded-xl hover:bg-card text-text-muted hover:text-text transition-colors"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="sm:hidden py-4 border-t border-border animate-slide-up">
            <div className="flex flex-col gap-1">
              {navLinks.map(({ to, label, highlight, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary text-bg'
                        : highlight && isLive
                          ? 'text-live bg-live/10'
                          : 'text-text-muted hover:text-text hover:bg-card'
                    }`
                  }
                >
                  <span className="text-lg">{icon}</span>
                  <span>{label}</span>
                  {highlight && isLive && (
                    <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-live/20 text-live text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                      LIVE
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
