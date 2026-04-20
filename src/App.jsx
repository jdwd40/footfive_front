import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Layout from './components/layout/Layout'
import { ToastProvider } from './components/common/Toast'

// Pages
import Home from './pages/Home'
import LiveDashboard from './pages/LiveDashboard'
import LiveMatchDetail from './pages/LiveMatchDetail'
import FixtureList from './pages/FixtureList'
import FixtureDetail from './pages/FixtureDetail'
import TeamList from './pages/TeamList'
import TeamDetail from './pages/TeamDetail'
import OddsList from './pages/OddsList'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            
            {/* Live Tournament */}
            <Route path="/live" element={<LiveDashboard />} />
            <Route path="/live/:fixtureId" element={<LiveMatchDetail />} />
            
            {/* Legacy route redirect */}
            <Route path="/tournament" element={<LiveDashboard />} />
            
            {/* Fixtures & History */}
            <Route path="/fixtures" element={<FixtureList />} />
            <Route path="/fixtures/:id/live" element={<FixtureLiveRedirect />} />
            <Route path="/fixtures/:id" element={<FixtureDetail />} />
            
            {/* Teams */}
            <Route path="/teams" element={<TeamList />} />
            <Route path="/teams/:id" element={<TeamDetail />} />
            
            {/* Odds */}
            <Route path="/odds" element={<OddsList />} />
            
            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </BrowserRouter>
  )
}

function FixtureLiveRedirect() {
  const { id } = useParams()
  return <Navigate to={`/live/${id}`} replace />
}

function NotFound() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-20 text-center">
      <span className="text-6xl mb-4 block">🤷</span>
      <h1 className="text-3xl font-bold text-text mb-2">Page Not Found</h1>
      <p className="text-text-muted mb-6">
        The page you're looking for doesn't exist.
      </p>
      <a href="/" className="btn btn-primary">
        Go Home
      </a>
    </div>
  )
}
