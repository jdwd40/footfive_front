import { dedupeLiveEventsBySeq, sortLiveEventsDesc } from '../utils/liveEventModel'

/**
 * Dedupe key aligned with liveEventModel: seq, event_id, eventId, id, composite fallback.
 * @param {object} event
 * @returns {string}
 */
export function getEventDedupeKey(event) {
  if (!event) return ''
  const seq = Number(event.seq)
  if (seq > 0) return `seq:${seq}`
  if (event.event_id != null) return `event_id:${event.event_id}`
  if (event.eventId != null) return `eventId:${event.eventId}`
  if (event.id != null) return `id:${event.id}`
  return `n:${event.type}:${event.minute}:${event.second}:${event.fixtureId}:${event.description}`
}

/**
 * Readable reveal delay before showing an event (ms). Backend pacing is a hint only;
 * very short backend delays are clamped to type-appropriate minimums.
 * @param {object} event
 * @param {number} [pendingQueueLength]
 * @returns {number}
 */
export function getReadableEventDelay(event, pendingQueueLength = 0) {
  const pacing = event?.pacing ?? event?.metadata?.pacing
  const backendDelay = pacing?.delay_ms
  const type = String(event?.event_type ?? event?.type ?? '').toLowerCase()
  const chainType = String(
    event?.chain_type ?? event?.metadata?.chain_type ?? event?.chainType ?? ''
  ).toLowerCase()
  const isShootout =
    chainType === 'shootout' ||
    type.startsWith('shootout_')
  const isPenalty =
    chainType === 'penalty' ||
    type.startsWith('penalty_')
  const isMajor = [
    'goal',
    'penalty_scored',
    'shootout_goal',
    'shootout_end',
    'match_end',
    'final_score',
    'match_winner',
  ].includes(type)
  const isShotResult = [
    'shot_saved',
    'shot_missed',
    'shot_blocked',
    'penalty_saved',
    'penalty_missed',
    'shootout_save',
    'shootout_miss',
  ].includes(type)
  const isBuildUp = [
    'goal_build_up',
    'midfield_battle',
    'counter_attack',
    'attack_breakdown',
    'counter_breakdown',
  ].includes(type)
  const isRestart = type === 'kickoff_restart'
  let baseDelay
  if (isShootout || isPenalty) {
    baseDelay = 2000
  } else if (isMajor) {
    baseDelay = 4800
  } else if (isShotResult) {
    baseDelay = 3800
  } else if (isRestart) {
    baseDelay = 2800
  } else if (isBuildUp) {
    baseDelay = 3200
  } else {
    baseDelay = 3500
  }
  if (pendingQueueLength > 15 && !isMajor) {
    baseDelay = Math.min(baseDelay, 2500)
  } else if (pendingQueueLength > 8 && !isMajor) {
    baseDelay = Math.min(baseDelay, 3000)
  }
  if (typeof backendDelay === 'number' && Number.isFinite(backendDelay)) {
    const readableMinimum = isShootout || isPenalty ? 2000 : 3000
    const readableMaximum = isMajor ? 5500 : 5000
    return Math.max(
      readableMinimum,
      Math.min(Math.max(baseDelay, backendDelay), readableMaximum)
    )
  }
  return baseDelay
}

/** @deprecated Use getReadableEventDelay; kept for existing imports/tests. */
export function getEventPacingDelayMs(event, defaultDelayMs = 3500, pendingQueueLength = 0) {
  const delay = getReadableEventDelay(event, pendingQueueLength)
  return Number.isFinite(delay) && delay >= 0 ? delay : defaultDelayMs
}

/**
 * Imperative paced reveal queue (used by usePacedEventReveal).
 * @param {object} options
 * @param {boolean} [options.enabled]
 * @param {number} [options.defaultDelayMs]
 * @param {(events: object[]) => void} options.onVisibleChange
 * @param {typeof setTimeout} [options.scheduleTimeout]
 * @param {typeof clearTimeout} [options.clearScheduledTimeout]
 */
export function createPacedRevealQueue({
  enabled = true,
  defaultDelayMs = 3500,
  onVisibleChange,
  onEventRevealed,
  scheduleTimeout = setTimeout,
  clearScheduledTimeout = clearTimeout,
}) {
  let visibleEvents = []
  const queue = []
  let timerId = null
  let revealing = false
  const seenVisible = new Set()

  const emit = () => onVisibleChange([...visibleEvents])

  const isSeen = (event) => seenVisible.has(getEventDedupeKey(event))

  const markSeen = (event) => {
    seenVisible.add(getEventDedupeKey(event))
  }

  const removeFromQueue = (keys) => {
    if (!keys || keys.size === 0) return
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (keys.has(getEventDedupeKey(queue[i]))) {
        queue.splice(i, 1)
      }
    }
  }

  const prependVisible = (event, { notify = false } = {}) => {
    if (!event || isSeen(event)) return
    markSeen(event)
    visibleEvents = sortLiveEventsDesc(dedupeLiveEventsBySeq([event, ...visibleEvents]))
    emit()
    if (notify) onEventRevealed?.(event)
  }

  const clearRevealTimer = () => {
    if (timerId != null) {
      clearScheduledTimeout(timerId)
      timerId = null
    }
  }

  const processQueue = () => {
    if (!enabled) return
    if (queue.length === 0) {
      revealing = false
      return
    }
    if (revealing || timerId != null) return

    revealing = true
    const event = queue.shift()
    const delayMs = getReadableEventDelay(event, queue.length) || defaultDelayMs

    timerId = scheduleTimeout(() => {
      timerId = null
      revealing = false
      prependVisible(event, { notify: true })
      processQueue()
    }, delayMs)
  }

  const enqueue = (event) => {
    if (!enabled || !event || isSeen(event)) return
    const key = getEventDedupeKey(event)
    if (queue.some((e) => getEventDedupeKey(e) === key)) return
    queue.push(event)
    processQueue()
  }

  const setVisibleImmediately = (events) => {
    clearRevealTimer()
    queue.length = 0
    revealing = false
    visibleEvents = sortLiveEventsDesc(dedupeLiveEventsBySeq(events || []))
    seenVisible.clear()
    visibleEvents.forEach(markSeen)
    emit()
  }

  const appendVisibleImmediately = (eventsInput) => {
    const list = Array.isArray(eventsInput) ? eventsInput : [eventsInput]
    const newOnes = list.filter((e) => e && !isSeen(e))
    if (newOnes.length === 0) return
    const keys = new Set(newOnes.map(getEventDedupeKey))
    removeFromQueue(keys)
    newOnes.forEach(markSeen)
    visibleEvents = sortLiveEventsDesc(dedupeLiveEventsBySeq([...newOnes, ...visibleEvents]))
    emit()
  }

  const reset = () => {
    clearRevealTimer()
    queue.length = 0
    revealing = false
    seenVisible.clear()
    visibleEvents = []
    emit()
  }

  const dispose = () => {
    clearRevealTimer()
  }

  return {
    getVisibleEvents: () => visibleEvents,
    enqueue,
    setVisibleImmediately,
    appendVisibleImmediately,
    reset,
    dispose,
  }
}
