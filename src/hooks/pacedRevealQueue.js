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
 * @param {object} event
 * @param {number} defaultDelayMs
 * @returns {number}
 */
export function getEventPacingDelayMs(event, defaultDelayMs = 1000) {
  const pacing = event?.pacing ?? event?.metadata?.pacing
  if (pacing && pacing.delay_ms != null) {
    const n = Number(pacing.delay_ms)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return defaultDelayMs
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
  defaultDelayMs = 1000,
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
    const delayMs = getEventPacingDelayMs(event, defaultDelayMs)

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
