// Date formatting
export const formatDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

export const formatTime = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const formatDateTime = (dateString) => {
  return `${formatDate(dateString)} ${formatTime(dateString)}`
}

export const formatRelativeTime = (dateString) => {
  const date = new Date(dateString)
  const now = new Date()
  const diff = date - now
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor(diff / (1000 * 60))

  if (days > 0) return `in ${days}d`
  if (hours > 0) return `in ${hours}h`
  if (minutes > 0) return `in ${minutes}m`
  if (minutes > -60) return 'now'
  return formatDate(dateString)
}

// Match clock formatting
export const formatMatchTime = (minute, second = 0) => {
  const min = String(minute).padStart(2, '0')
  const sec = String(second).padStart(2, '0')
  return `${min}:${sec}`
}

// Odds formatting
export const formatOdds = (decimal) => {
  if (!decimal || decimal <= 0) return '-'
  return decimal.toFixed(2)
}

export const formatProbability = (probability) => {
  if (!probability && probability !== 0) return '-'
  return `${(probability * 100).toFixed(1)}%`
}

// Stats formatting
export const formatPercentage = (value, total) => {
  if (!total) return '0%'
  return `${((value / total) * 100).toFixed(0)}%`
}

export const formatRating = (rating) => {
  if (!rating && rating !== 0) return '-'
  return rating.toFixed(1)
}

// Team name formatting
export const shortenTeamName = (name, maxLength = 12) => {
  if (!name) return ''
  if (name.length <= maxLength) return name
  return name.substring(0, maxLength - 1) + '…'
}

// Event type icons
export const eventIcons = {
  goal: '⚽',
  penalty_scored: '⚽',
  match_start: '🏁',
  match_end: '🏆',
  second_half_start: '▶️',
  extra_time_half: '⏸️',
  extra_time_end: '⏱️',
  shot_saved: '🧤',
  shot_missed: '❌',
  yellow_card: '🟨',
  red_card: '🟥',
  foul: '⚠️',
  corner: '🚩',
  penalty_awarded: '🎯',
  penalty_goal: '⚽',
  penalty_saved: '🧤',
  penalty_missed: '❌',
  kickoff: '🏁',
  halftime: '⏸️',
  fulltime: '🏆',
  shootout_start: '🎯',
  shootout_end: '🏆',
  extra_time_start: '⏱️',
  substitution: '🔄',
  injury: '🏥',
  var_check: '📺',
  offside: '🚫',
  // Flow / narration events
  possession: '🔵',
  build_up: '📈',
  keeper_distribution: '🧤',
  defensive_action: '🛡️',
  chance_created: '✨',
  shot: '🎯',
  save: '🧤',
  miss: '❌',
  block: '🛡️',
  counter_attack: '⚡',
  breakaway: '💨',
  final_score: '🏁',
  shootout_goal: '⚽',
  shot_blocked: '🛡️',
  shootout_save: '🧤',
  shootout_miss: '❌',
  match_observation: '🎙️',
  midfield_battle: '⚔️',
  goal_build_up: '📈',
  attack_breakdown: '💥',
  counter_breakdown: '🛑',
  kickoff_restart: '▶️',
  penalty_walkup: '🚶',
  penalty_run_up: '🏃',
  shootout_walkup: '🎯',
  shootout_reaction: '👏',
  match_winner: '🏆',
  match_draw: '🤝',
}

export const getEventIcon = (eventType) => {
  return eventIcons[eventType] || '📌'
}

// Status badge styling
export const getStatusBadge = (status) => {
  switch (status?.toLowerCase()) {
    case 'live':
      return { class: 'badge-live', text: 'LIVE' }
    case 'scheduled':
      return { class: 'badge-scheduled', text: 'Upcoming' }
    case 'completed':
    case 'finished':
      return { class: 'badge-completed', text: 'FT' }
    default:
      return { class: 'bg-gray-500/20 text-gray-400', text: status || 'Unknown' }
  }
}

// Form indicator (W/L/D)
export const getFormColor = (result) => {
  switch (result?.toUpperCase()) {
    case 'W':
      return 'bg-win text-white'
    case 'L':
      return 'bg-loss text-white'
    case 'D':
      return 'bg-draw text-black'
    default:
      return 'bg-gray-500 text-white'
  }
}

// Score formatting
export const formatScore = (homeScore, awayScore) => {
  if (homeScore === null || homeScore === undefined) return 'vs'
  return `${homeScore} - ${awayScore}`
}

