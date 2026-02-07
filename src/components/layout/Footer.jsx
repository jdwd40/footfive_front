import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/25">
                <span className="text-xl">⚽</span>
              </div>
              <span className="text-xl font-bold">
                <span className="text-gradient">Foot</span>
                <span className="text-text">Five</span>
              </span>
            </Link>
            <p className="text-sm text-text-muted">
              Live 5-a-side football tournament simulation with real-time scores and comprehensive team statistics.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-text mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/live" className="text-sm text-text-muted hover:text-primary transition-colors">
                  🔴 Live Tournament
                </Link>
              </li>
              <li>
                <Link to="/teams" className="text-sm text-text-muted hover:text-primary transition-colors">
                  👥 Team Statistics
                </Link>
              </li>
              <li>
                <Link to="/fixtures" className="text-sm text-text-muted hover:text-primary transition-colors">
                  📅 Match History
                </Link>
              </li>
            </ul>
          </div>

          {/* Tournament timing */}
          <div>
            <h4 className="font-semibold text-text mb-4">How it works</h4>
            <div className="text-sm text-text-muted space-y-2">
              <p>Each round starts 5 minutes after the last one finishes.</p>
              <p>When a tournament finishes, we wait 5 minutes before starting the next one.</p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-muted">
            Tournaments run back-to-back with short breaks
          </p>
          <p className="text-xs text-text-muted">
            Built with React + Vite
          </p>
        </div>
      </div>
    </footer>
  )
}
