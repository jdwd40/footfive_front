/* eslint-disable react-hooks/purity -- countdown derives display from Date.now() */
import { useEffect, useState } from 'react'
import { formatCountdown } from '../../utils/tournamentPhases'

/**
 * Small kickoff countdown. Renders `prefix MM:SS` while time remains,
 * `fallback` once the clock hits zero (or when no timestamp is known).
 *
 * kickoffAt: epoch ms (or anything Date can parse), or null.
 */
export default function KickoffCountdown({
  kickoffAt,
  prefix = 'Kickoff in',
  fallback = 'Preparing next fixture…',
  className = '',
}) {
  const [, setTick] = useState(0)

  const targetMs = kickoffAt != null ? new Date(kickoffAt).getTime() : null
  const remaining = targetMs != null ? targetMs - Date.now() : null
  const counting = remaining != null && remaining > 0

  useEffect(() => {
    if (!counting) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [counting])

  if (!counting) {
    return (
      <span className={`inline-flex items-center gap-2 text-amber-400 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        {fallback}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-2 text-primary ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {prefix}{' '}
      <span className="font-mono font-bold tracking-wider">{formatCountdown(remaining)}</span>
    </span>
  )
}
