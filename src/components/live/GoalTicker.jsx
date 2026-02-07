import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * GoalTicker - A scrolling ticker that shows live scores and announces match events
 * - During breaks: Shows "Semi-finals Next..." or similar
 * - During live matches: Scrolls through all match scores
 * - When events happen: Shows announcements for goals, extra time, penalties, winners
 * - Multiple events: Queues announcements and shows them one after another (faster when queued)
 */
export default function GoalTicker({
    goalEvents = [],
    matches = [],
    isLive = false,
    isBreak = false,
    currentRound = '',
    nextRound = ''
}) {
    const [currentAnnouncement, setCurrentAnnouncement] = useState(null)
    const [queue, setQueue] = useState([])
    const prevEventsLengthRef = useRef(0)
    const processedSeqsRef = useRef(new Set())
    const timerRef = useRef(null)

    // Display durations (in ms)
    const GOAL_DURATION = 6000        // 6 seconds for goals (single)
    const GOAL_QUEUED_DURATION = 3000 // 3 seconds when multiple goals queued
    const PENALTY_DURATION = 3000     // 3 seconds for penalty events
    const WINNER_DURATION = 6000      // 6 seconds for winners
    const EVENT_DURATION = 3000       // 3 seconds for other events

    // Get live matches with scores - use these for the ticker display
    const liveMatches = matches.filter(m =>
        ['FIRST_HALF', 'SECOND_HALF', 'EXTRA_TIME_1', 'EXTRA_TIME_2', 'PENALTIES', 'HALFTIME', 'ET_HALFTIME'].includes(m.state)
    )

    // Check for matches in special states
    const extraTimeMatches = matches.filter(m =>
        ['EXTRA_TIME_1', 'EXTRA_TIME_2', 'ET_HALFTIME'].includes(m.state)
    )
    const penaltyMatches = matches.filter(m => m.state === 'PENALTIES')

    // Process queue - show next announcement when current one finishes
    useEffect(() => {
        // If we have announcements in queue and nothing is currently showing
        if (queue.length > 0 && !currentAnnouncement) {
            const [nextAnnouncement, ...rest] = queue

            // Determine duration - shorter if there are more in queue
            let duration = nextAnnouncement.duration
            if (nextAnnouncement.type === 'goal' && rest.length > 0) {
                duration = GOAL_QUEUED_DURATION // Speed up if more goals waiting
            }

            setCurrentAnnouncement({ ...nextAnnouncement, activeDuration: duration })
            setQueue(rest)

            // Clear after duration
            timerRef.current = setTimeout(() => {
                setCurrentAnnouncement(null)
            }, duration)
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current)
            }
        }
    }, [queue, currentAnnouncement])

    // Add announcement to queue
    const addToQueue = useCallback((announcement) => {
        if (!announcement) return
        console.log('[GoalTicker] Adding to queue:', announcement.title, announcement.text)
        setQueue(prev => [...prev, announcement])
    }, [])

    // Process new events when goalEvents array grows
    useEffect(() => {
        const currentLength = goalEvents.length

        // Only process if we have new events
        if (currentLength > prevEventsLengthRef.current && currentLength > 0) {
            // Get all new events since last check
            const newEvents = goalEvents.slice(prevEventsLengthRef.current)

            newEvents.forEach(event => {
                // Skip if we've already processed this event (by seq)
                const seq = event.seq || 0
                if (seq > 0 && processedSeqsRef.current.has(seq)) return
                if (seq > 0) processedSeqsRef.current.add(seq)

                const eventType = event.type || event.event_type
                console.log('[GoalTicker] New event:', eventType, event)

                let newAnnouncement = null

                // GOAL events
                if (['goal', 'penalty_scored', 'shootout_goal', 'penalty_goal'].includes(eventType)) {
                    newAnnouncement = formatGoalAnnouncement(event)
                }
                // EXTRA TIME event
                else if (eventType === 'extra_time_start') {
                    const homeTeam = event.homeTeam?.name || 'Home'
                    const awayTeam = event.awayTeam?.name || 'Away'
                    const homeScore = event.score?.home ?? 0
                    const awayScore = event.score?.away ?? 0

                    newAnnouncement = {
                        type: 'extratime',
                        title: 'EXTRA TIME!',
                        text: `${homeTeam} vs ${awayTeam} goes to extra time!`,
                        score: `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`,
                        duration: EVENT_DURATION,
                    }
                }
                // PENALTIES event
                else if (eventType === 'shootout_start') {
                    const homeTeam = event.homeTeam?.name || 'Home'
                    const awayTeam = event.awayTeam?.name || 'Away'
                    const homeScore = event.score?.home ?? 0
                    const awayScore = event.score?.away ?? 0

                    newAnnouncement = {
                        type: 'penalties',
                        title: 'PENALTY SHOOTOUT!',
                        text: `${homeTeam} vs ${awayTeam} has gone to penalty shootout!`,
                        score: `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam} (AET)`,
                        duration: PENALTY_DURATION,
                    }
                }
                // MATCH END / WINNER event
                else if (eventType === 'match_end') {
                    const homeTeam = event.homeTeam?.name || 'Home'
                    const awayTeam = event.awayTeam?.name || 'Away'
                    const homeScore = event.score?.home ?? 0
                    const awayScore = event.score?.away ?? 0
                    const penHome = event.penaltyScore?.home
                    const penAway = event.penaltyScore?.away
                    const hasPenalties = penHome != null && penAway != null && (penHome > 0 || penAway > 0)

                    let winner = null
                    if (hasPenalties) {
                        winner = penHome > penAway ? homeTeam : awayTeam
                    } else if (homeScore !== awayScore) {
                        winner = homeScore > awayScore ? homeTeam : awayTeam
                    }

                    if (winner) {
                        const scoreText = hasPenalties
                            ? `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam} (${penHome} - ${penAway} pens)`
                            : `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`

                        newAnnouncement = {
                            type: 'winner',
                            title: hasPenalties ? 'SHOOTOUT WINNER!' : 'FULL TIME!',
                            text: `${winner} win${hasPenalties ? ' on penalties!' : '!'}`,
                            score: scoreText,
                            duration: WINNER_DURATION,
                        }
                    }
                }

                // Add to queue if we have an announcement
                if (newAnnouncement) {
                    addToQueue(newAnnouncement)
                }
            })

            // Keep processedSeqs set from growing too large
            if (processedSeqsRef.current.size > 200) {
                const arr = [...processedSeqsRef.current]
                processedSeqsRef.current = new Set(arr.slice(-100))
            }
        }

        prevEventsLengthRef.current = currentLength
    }, [goalEvents, addToQueue])

    // Format goal announcement - get latest score from matches prop
    function formatGoalAnnouncement(goal) {
        if (!goal) return null

        const scoringTeam = goal.teamId === goal.homeTeam?.id
            ? goal.homeTeam
            : goal.awayTeam

        const scoringTeamName = scoringTeam?.name || goal.team_name || 'Team'

        // Try to get the current score from the matches array for accuracy
        const fixtureId = goal.fixtureId
        const matchData = matches.find(m =>
            m.fixtureId == fixtureId || String(m.fixtureId) === String(fixtureId)
        )

        // Use match data if available, otherwise fall back to event data
        const homeScore = matchData?.score?.home ?? goal.score?.home ?? 0
        const awayScore = matchData?.score?.away ?? goal.score?.away ?? 0
        const homeTeamName = matchData?.homeTeam?.name || goal.homeTeam?.name || 'Home'
        const awayTeamName = matchData?.awayTeam?.name || goal.awayTeam?.name || 'Away'

        const isPenalty = goal.type === 'penalty_scored' || goal.type === 'penalty_goal'
        const isShootout = goal.type === 'shootout_goal'

        let announcementText = `${scoringTeamName} have scored!`

        if (homeScore === awayScore) {
            announcementText = `${scoringTeamName} have equalized!`
        } else if (
            (goal.teamId === goal.homeTeam?.id && homeScore > awayScore) ||
            (goal.teamId === goal.awayTeam?.id && awayScore > homeScore)
        ) {
            if (Math.abs(homeScore - awayScore) === 1 && (homeScore + awayScore) > 1) {
                announcementText = `${scoringTeamName} take the lead!`
            }
        }

        if (isShootout) {
            announcementText = `${scoringTeamName} score in the shootout!`
        } else if (isPenalty) {
            announcementText = `${scoringTeamName} score from the spot!`
        }

        return {
            type: 'goal',
            title: 'GOAL!',
            text: announcementText,
            score: `${homeTeamName} ${homeScore} - ${awayScore} ${awayTeamName}`,
            minute: goal.minute,
            playerName: goal.displayName || goal.player_name,
            duration: GOAL_DURATION,
        }
    }

    // Get styling based on announcement type
    function getStyle(type) {
        const styles = {
            goal: {
                bg: 'from-live/20 via-live/10 to-live/20 border-live/30',
                icon: '⚽',
                titleColor: 'text-live',
            },
            extratime: {
                bg: 'from-amber-500/20 via-amber-500/10 to-amber-500/20 border-amber-500/30',
                icon: '⏱️',
                titleColor: 'text-amber-400',
            },
            penalties: {
                bg: 'from-purple-500/20 via-purple-500/10 to-purple-500/20 border-purple-500/30',
                icon: '🎯',
                titleColor: 'text-purple-400',
            },
            winner: {
                bg: 'from-gold/20 via-gold/10 to-gold/20 border-gold/30',
                icon: '🏆',
                titleColor: 'text-gold',
            },
        }
        return styles[type] || styles.goal
    }

    // During break periods - show next round
    if (isBreak && nextRound) {
        return (
            <div className="relative overflow-hidden mb-4">
                <div className="relative rounded-xl px-4 py-3 border shadow-lg
                       bg-gradient-to-r from-accent/10 via-card to-accent/10 
                       border-accent/20 shadow-accent/5">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🏟️</span>
                        <div className="w-px h-8 bg-accent/30" />
                        <div className="flex items-center gap-3">
                            <span className="text-accent font-bold text-lg tracking-wide">
                                {nextRound} Next...
                            </span>
                            <span className="text-text-muted text-sm">
                                Matches starting soon
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Not live and not break - don't show
    if (!isLive) {
        return null
    }

    const style = currentAnnouncement ? getStyle(currentAnnouncement.type) : null

    return (
        <div className="relative overflow-hidden mb-4">
            <div className={`relative rounded-xl px-4 py-3 border shadow-lg transition-all duration-300
                     bg-gradient-to-r ${currentAnnouncement
                    ? style.bg
                    : 'from-primary/10 via-card to-primary/10 border-primary/20'}`}>

                {/* Icon */}
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className={`text-2xl ${currentAnnouncement ? 'animate-bounce' : ''}`}>
                        {currentAnnouncement ? style.icon : '📺'}
                    </span>
                    <div className="w-px h-8 bg-white/20" />
                </div>

                {/* Content area */}
                <div className="ml-14">
                    {currentAnnouncement ? (
                        // Event Announcement Mode
                        <div className="animate-slide-up">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className={`${style.titleColor} font-bold text-lg tracking-wide animate-pulse`}>
                                    {currentAnnouncement.title}
                                </span>
                                <span className="text-text font-semibold">
                                    {currentAnnouncement.text}
                                </span>
                                {currentAnnouncement.minute && (
                                    <span className="text-text-muted text-sm">
                                        ({currentAnnouncement.minute}')
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm">
                                <span className="font-mono font-bold text-primary">
                                    {currentAnnouncement.score}
                                </span>
                                {currentAnnouncement.playerName && (
                                    <>
                                        <span className="text-text-muted">•</span>
                                        <span className="text-text-muted italic">
                                            {currentAnnouncement.playerName}
                                        </span>
                                    </>
                                )}
                                {/* Queue indicator */}
                                {queue.length > 0 && (
                                    <>
                                        <span className="text-text-muted">•</span>
                                        <span className="text-text-muted text-xs">
                                            +{queue.length} more
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        // Scrolling Scores Mode - uses liveMatches for accurate scores
                        <div className="overflow-hidden">
                            <div className="flex items-center gap-2">
                                <span className="text-primary font-bold shrink-0 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-live animate-pulse" />
                                    LIVE
                                </span>

                                {/* Extra time / Penalties badges */}
                                {extraTimeMatches.length > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold shrink-0">
                                        ⏱️ ET
                                    </span>
                                )}
                                {penaltyMatches.length > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold shrink-0">
                                        🎯 PENS
                                    </span>
                                )}

                                <span className="text-text-muted shrink-0">|</span>

                                {liveMatches.length > 0 ? (
                                    <div className="overflow-hidden flex-1">
                                        <div className="flex gap-6 animate-scroll-left">
                                            {liveMatches.map((match, idx) => (
                                                <ScoreItem key={`${match.fixtureId}-${idx}`} match={match} />
                                            ))}
                                            {liveMatches.map((match, idx) => (
                                                <ScoreItem key={`dup-${match.fixtureId}-${idx}`} match={match} />
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-text-muted text-sm">
                                        {currentRound} in progress...
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Glow effect for announcements */}
            {currentAnnouncement && (
                <div
                    className="absolute inset-0 rounded-xl pointer-events-none animate-pulse"
                    style={{
                        background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.05) 0%, transparent 70%)',
                    }}
                />
            )}
        </div>
    )
}

// Individual score item for scrolling ticker - displays current match score
function ScoreItem({ match }) {
    const homeTeam = match.homeTeam?.name || 'Home'
    const awayTeam = match.awayTeam?.name || 'Away'
    const homeScore = match.score?.home ?? 0
    const awayScore = match.score?.away ?? 0
    const isExtraTime = ['EXTRA_TIME_1', 'EXTRA_TIME_2', 'ET_HALFTIME'].includes(match.state)
    const isPenalties = match.state === 'PENALTIES'
    const penHome = match.penaltyScore?.home ?? 0
    const penAway = match.penaltyScore?.away ?? 0

    return (
        <span className="whitespace-nowrap text-sm flex items-center gap-2 shrink-0">
            <span className="font-semibold text-text">{homeTeam}</span>
            <span className="font-mono font-bold text-primary">
                {homeScore} - {awayScore}
                {isPenalties && <span className="text-purple-400 ml-1">({penHome}-{penAway})</span>}
            </span>
            <span className="font-semibold text-text">{awayTeam}</span>
            {isExtraTime && <span className="text-amber-400 text-xs">(ET)</span>}
            {isPenalties && <span className="text-purple-400 text-xs">(PENS)</span>}
        </span>
    )
}
