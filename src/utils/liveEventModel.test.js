import { describe, it, expect } from 'vitest'
import {
  normalizeLiveEvent,
  dedupeLiveEventsBySeq,
  compareLiveEventsDesc,
  LIVE_SSE_EVENT_TYPES,
  canApplyMatchScoreFromEvent,
  canApplyPenaltyScoreFromEvent,
  resolveEventTeam,
  resolveOpponentTeam,
  reconcileEventTeamWithDescription,
  findTeamSideInText,
  isMisleadingBreakdownDescription,
  buildBreakdownSubtitle,
  resolveBreakdownParties,
  resolveEventDisplayTeams,
  parseAttackBreakdownDescription,
  getDisplayScoresFromEvents,
  getLatestClockFromEvents,
  getLatestMatchPhaseFromEvents,
  isMatchObservationEvent,
  getObservationDisplay,
} from './liveEventModel'

describe('normalizeLiveEvent', () => {
  it('merges SSE type with JSON body', () => {
    const n = normalizeLiveEvent(
      { seq: 5, fixtureId: 10, minute: 12, score: { home: 1, away: 0 } },
      { sseType: 'goal' }
    )
    expect(n.type).toBe('goal')
    expect(n.seq).toBe(5)
    expect(n.fixtureId).toBe(10)
  })

  it('maps legacy fixture row', () => {
    const n = normalizeLiveEvent({
      event_type: 'yellow_card',
      event_id: 99,
      minute: 44,
      team_name: 'A',
    })
    expect(n.type).toBe('yellow_card')
    expect(n.seq).toBe(99)
  })
})

describe('score application guards', () => {
  it('allows match score only on scoring types', () => {
    const score = { home: 1, away: 0 }
    expect(canApplyMatchScoreFromEvent({ type: 'goal', score })).toBe(true)
    expect(canApplyMatchScoreFromEvent({ type: 'penalty_scored', score })).toBe(true)
    expect(canApplyMatchScoreFromEvent({ type: 'goal_build_up', score })).toBe(false)
    expect(canApplyMatchScoreFromEvent({ type: 'shot_saved', score })).toBe(false)
  })

  it('allows penalty score only on shootout-related types', () => {
    const penaltyScore = { home: 1, away: 0 }
    expect(canApplyPenaltyScoreFromEvent({ type: 'shootout_goal', penaltyScore })).toBe(true)
    expect(canApplyPenaltyScoreFromEvent({ type: 'goal_build_up', penaltyScore })).toBe(false)
  })
})

describe('dedupeLiveEventsBySeq', () => {
  it('removes duplicate seq', () => {
    const a = { type: 'goal', seq: 1, fixtureId: 1 }
    const b = { type: 'goal', seq: 1, fixtureId: 1 }
    expect(dedupeLiveEventsBySeq([a, b])).toHaveLength(1)
  })
})

describe('compareLiveEventsDesc', () => {
  it('orders by seq descending', () => {
    const a = { seq: 1 }
    const b = { seq: 2 }
    expect(compareLiveEventsDesc(a, b)).toBeGreaterThan(0)
  })
})

describe('LIVE_SSE_EVENT_TYPES', () => {
  // EventSource silently drops named events that have no addEventListener,
  // so the registered list must include every type the backend can emit on
  // a fixture-filtered stream. If the backend adds a new emit type, add it
  // here too or it will be invisible on the live feed.
  const REQUIRED = [
    // Flow / narration / event chains
    'possession',
    'possession_play',
    'build_up',
    'build_up_play',
    'ball_progression',
    'keeper_distribution',
    'defensive_action',
    'midfield_battle',
    'goal_build_up',
    'attack_breakdown',
    'chance_created',
    'shot',
    'save',
    'miss',
    'block',
    'counter_attack',
    'counter_breakdown',
    'breakaway',
    'final_score',
    'match_winner',
    'match_draw',
    // Match-state lifecycle
    'kickoff',
    'kickoff_restart',
    'match_recap',
    // Goals / shots / discipline
    'goal',
    'shot_saved',
    'shot_missed',
    'shot_blocked',
    'corner',
    'foul',
    'penalty_awarded',
    'penalty_walkup',
    'penalty_run_up',
    'penalty_scored',
    'penalty_missed',
    'penalty_saved',
    // Shootout sub-events
    'shootout_walkup',
    'shootout_goal',
    'shootout_save',
    'shootout_miss',
    'shootout_reaction',
    'shootout_end',
  ]
  it.each(REQUIRED)('includes %s', (type) => {
    expect(LIVE_SSE_EVENT_TYPES).toContain(type)
  })
  it('still includes legacy events', () => {
    for (const t of ['goal', 'yellow_card', 'red_card', 'halftime', 'fulltime', 'match_end']) {
      expect(LIVE_SSE_EVENT_TYPES).toContain(t)
    }
  })
})

describe('normalizeLiveEvent description flattening', () => {
  it('lifts payload.description', () => {
    const n = normalizeLiveEvent(
      { seq: 1, payload: { description: 'pay-desc' } },
      { sseType: 'possession' }
    )
    expect(n.description).toBe('pay-desc')
    expect(n.type).toBe('possession')
  })
  it('lifts metadata.description (REST shape)', () => {
    const n = normalizeLiveEvent({
      event_type: 'shot',
      event_id: 7,
      metadata: { description: 'meta-desc' },
    })
    expect(n.description).toBe('meta-desc')
    expect(n.type).toBe('shot')
  })
  it('keeps top-level description when no wrapper', () => {
    const n = normalizeLiveEvent(
      { seq: 2, description: 'top' },
      { sseType: 'save' }
    )
    expect(n.description).toBe('top')
  })
})

describe('normalizeLiveEvent unknown sse type', () => {
  it('still normalizes so unknown types fall through to fallback display', () => {
    const n = normalizeLiveEvent(
      { seq: 3, payload: { description: 'd' } },
      { sseType: 'totally_new_type' }
    )
    expect(n).toBeTruthy()
    expect(n.type).toBe('totally_new_type')
    expect(n.description).toBe('d')
  })
})

describe('normalizeLiveEvent chain and bundle fields', () => {
  it('lifts bundleId and bundleStep from snake_case top-level', () => {
    const n = normalizeLiveEvent(
      { seq: 1, bundle_id: 'b1', bundle_step: 2, chain_type: 'attack', chain_terminal: true },
      { sseType: 'goal_build_up' }
    )
    expect(n.bundleId).toBe('b1')
    expect(n.bundleStep).toBe(2)
    expect(n.chain_type).toBe('attack')
    expect(n.chainType).toBe('attack')
    expect(n.chain_terminal).toBe(true)
    expect(n.chainTerminal).toBe(true)
  })

  it('lifts bundleId and chainType from camelCase payload', () => {
    const n = normalizeLiveEvent(
      {
        seq: 2,
        payload: {
          bundleId: 'b2',
          bundleStep: 0,
          chainType: 'counter',
          chainTerminal: false,
        },
      },
      { sseType: 'counter_attack' }
    )
    expect(n.bundleId).toBe('b2')
    expect(n.bundleStep).toBe(0)
    expect(n.chain_type).toBe('counter')
    expect(n.chainType).toBe('counter')
    expect(n.chain_terminal).toBe(false)
    expect(n.chainTerminal).toBe(false)
  })

  it('preserves null bundleStep for historical events', () => {
    const n = normalizeLiveEvent(
      { seq: 3, bundle_id: 'b3', bundle_step: null },
      { sseType: 'midfield_battle' }
    )
    expect(n.bundleId).toBe('b3')
    expect(n.bundleStep).toBeNull()
  })
})

describe('normalizeLiveEvent pacing', () => {
  it('normalizes pacing from top-level with camelCase aliases', () => {
    const n = normalizeLiveEvent(
      { seq: 1, pacing: { delayMs: 100, holdMs: 200 } },
      { sseType: 'attack_breakdown' }
    )
    expect(n.pacing).toEqual({ delay_ms: 100, hold_ms: 200 })
  })

  it('lifts pacing from metadata when not on flattened data', () => {
    const n = normalizeLiveEvent({
      event_type: 'shot_blocked',
      event_id: 4,
      metadata: { pacing: { delay_ms: 50, hold_ms: 80 } },
    })
    expect(n.pacing).toEqual({ delay_ms: 50, hold_ms: 80 })
  })

  it('uses flattened top-level pacing when metadata has no pacing', () => {
    const n = normalizeLiveEvent({
      event_type: 'counter_breakdown',
      event_id: 5,
      pacing: { delay_ms: 10, hold_ms: 20 },
      metadata: { description: 'breakdown' },
    })
    expect(n.pacing).toEqual({ delay_ms: 10, hold_ms: 20 })
  })

  it('falls back to metadata pacing when merge clears data.pacing', () => {
    const n = normalizeLiveEvent({
      event_type: 'penalty_walkup',
      event_id: 6,
      payload: { pacing: null },
      metadata: { pacing: { delay_ms: 30, hold_ms: 40 } },
    })
    expect(n.pacing).toEqual({ delay_ms: 30, hold_ms: 40 })
  })

  it('leaves pacing undefined when absent', () => {
    const n = normalizeLiveEvent({ seq: 6 }, { sseType: 'foul' })
    expect(n.pacing).toBeUndefined()
  })

  it('normalizes kickoff_restart with pacing but no chain_type', () => {
    const n = normalizeLiveEvent(
      { seq: 7, pacing: { delay_ms: 0, hold_ms: 500 } },
      { sseType: 'kickoff_restart' }
    )
    expect(n.type).toBe('kickoff_restart')
    expect(n.pacing).toEqual({ delay_ms: 0, hold_ms: 500 })
    expect(n.chain_type).toBeNull()
    expect(n.chainType).toBeNull()
  })
})

describe('resolveEventTeam', () => {
  const home = { id: 1, name: 'Doge City' }
  const away = { id: 2, name: 'Outside' }
  const ctx = { homeTeam: home, awayTeam: away }

  it('prefers explicit teamName over mismatched teamId', () => {
    const r = resolveEventTeam(
      { type: 'possession', teamName: 'Doge City', teamId: 2 },
      ctx
    )
    expect(r.team?.name).toBe('Doge City')
    expect(r.side).toBe('home')
  })

  it('resolves opponent from side', () => {
    const resolved = resolveEventTeam({ type: 'attack_breakdown', side: 'home' }, ctx)
    const opp = resolveOpponentTeam({ type: 'attack_breakdown', side: 'home' }, ctx, resolved)
    expect(opp.team?.name).toBe('Outside')
    expect(opp.side).toBe('away')
  })

  it('returns null team safely when context missing', () => {
    expect(resolveEventTeam({ type: 'possession' }, {}).team).toBeNull()
  })
})

describe('reconcileEventTeamWithDescription', () => {
  const home = { id: 1, name: 'Doge City' }
  const away = { id: 2, name: 'Outside' }
  const ctx = { homeTeam: home, awayTeam: away }

  it('aligns possession team with backend description when teamId disagrees', () => {
    const r = reconcileEventTeamWithDescription(
      { type: 'possession', teamId: 2 },
      ctx,
      'Doge City are keeping the ball'
    )
    expect(r.team?.name).toBe('Doge City')
    expect(r.side).toBe('home')
  })

  it('aligns build-up team when description uses abbreviated name', () => {
    const r = reconcileEventTeamWithDescription(
      { type: 'build_up', teamId: 2 },
      ctx,
      'Doge build up play down the flank'
    )
    expect(r.team?.name).toBe('Doge City')
    expect(r.side).toBe('home')
  })

  it('findTeamSideInText picks unambiguous team', () => {
    expect(findTeamSideInText('Doge City build up play down the flank', 'Doge City', 'Outside')).toBe(
      'home'
    )
    expect(findTeamSideInText('Doge build up play down the flank', 'Doge City', 'Outside')).toBe('home')
  })
})

describe('breakdown copy helpers', () => {
  it('detects misleading shut-down-by-attack phrasing', () => {
    expect(isMisleadingBreakdownDescription("Doge City shut down by Outside's attack")).toBe(true)
    expect(isMisleadingBreakdownDescription("Outside's defence wins it back")).toBe(false)
  })

  it('parses attack breakdown description into defending and attacking names', () => {
    expect(parseAttackBreakdownDescription("Green Bay shut down Tripper's attack.")).toEqual({
      defendingName: 'Green Bay',
      attackingName: 'Tripper',
    })
  })

  it('builds attack breakdown subtitle with correct teams', () => {
    expect(buildBreakdownSubtitle('Tripper', 'Green Bay', 'attack_breakdown')).toBe(
      "Green Bay shut down Tripper's attack"
    )
  })

  it('builds counter breakdown subtitle with countering team', () => {
    expect(buildBreakdownSubtitle('Tripper', 'Green Bay', 'counter_breakdown')).toBe(
      "Green Bay recover and snuff out Tripper's counter"
    )
  })
})

describe('resolveBreakdownParties', () => {
  const home = { id: 1, name: 'Green Bay' }
  const away = { id: 2, name: 'Tripper' }
  const ctx = { homeTeam: home, awayTeam: away }

  it('attack_breakdown: possession is attacker, not defender teamId', () => {
    const parties = resolveBreakdownParties(
      {
        type: 'attack_breakdown',
        teamId: 1,
        description: "Green Bay shut down Tripper's attack.",
      },
      ctx
    )
    expect(parties.possessionTeam?.name).toBe('Tripper')
    expect(parties.possessionSide).toBe('away')
    expect(parties.defendingTeam?.name).toBe('Green Bay')
    expect(parties.defendingSide).toBe('home')
  })

  it('counter_breakdown: possession is countering team, teamId is recovering defender', () => {
    const parties = resolveBreakdownParties(
      {
        type: 'counter_breakdown',
        teamId: 1,
        description: 'Green Bay recover and snuff out the counter.',
      },
      ctx
    )
    expect(parties.possessionTeam?.name).toBe('Tripper')
    expect(parties.defendingTeam?.name).toBe('Green Bay')
  })

  it('resolveEventDisplayTeams exposes possession for breakdown headline', () => {
    const display = resolveEventDisplayTeams(
      {
        type: 'attack_breakdown',
        teamId: 1,
        description: "Green Bay shut down Tripper's attack.",
      },
      ctx
    )
    expect(display.isBreakdown).toBe(true)
    expect(display.possession.team?.name).toBe('Tripper')
    expect(display.opponent.team?.name).toBe('Green Bay')
  })
})

describe('getLatestClockFromEvents', () => {
  it('returns latest minute/second across visible events', () => {
    expect(
      getLatestClockFromEvents([
        { minute: 44, second: 10 },
        { minute: 45, second: 5 },
        { minute: 44, second: 55 },
      ])
    ).toEqual({ minute: 45, second: 5 })
  })

  it('returns zero when no events', () => {
    expect(getLatestClockFromEvents([])).toEqual({ minute: 0, second: 0 })
  })
})

describe('getDisplayScoresFromEvents', () => {
  it('uses latest revealed scoring event, not fallback ahead of reveal', () => {
    const fallback = { home: 2, away: 1 }
    const events = [
      { type: 'goal', seq: 10, score: { home: 2, away: 1 } },
      { type: 'possession', seq: 9, score: { home: 2, away: 1 } },
    ]
    const { score } = getDisplayScoresFromEvents(events, fallback)
    expect(score).toEqual({ home: 2, away: 1 })
  })

  it('falls back when no scoring events are visible yet', () => {
    const fallback = { home: 1, away: 0 }
    const { score } = getDisplayScoresFromEvents(
      [{ type: 'possession', seq: 5, score: { home: 2, away: 1 } }],
      fallback
    )
    expect(score).toEqual({ home: 1, away: 0 })
  })

  it('ignores build-up score snapshots in fallback path', () => {
    const { score } = getDisplayScoresFromEvents(
      [{ type: 'goal_build_up', seq: 8, score: { home: 2, away: 0 } }],
      { home: 1, away: 0 }
    )
    expect(score).toEqual({ home: 1, away: 0 })
  })

  it('prefers latest revealed goal score over stale bootstrap fallback', () => {
    const { score } = getDisplayScoresFromEvents(
      [
        { type: 'goal', seq: 30, score: { home: 3, away: 0 } },
        { type: 'goal', seq: 20, score: { home: 2, away: 0 } },
        { type: 'possession', seq: 10 },
      ],
      { home: 1, away: 0 }
    )
    expect(score).toEqual({ home: 3, away: 0 })
  })
})

describe('structured side + matchPhase (Improvement #2)', () => {
  const homeTeam = { id: 1, name: 'Metro City' }
  const awayTeam = { id: 2, name: 'Airway City' }
  const ctx = { homeTeam, awayTeam }

  it('lifts side and matchPhase from the SSE payload shape', () => {
    const normalized = normalizeLiveEvent({
      type: 'goal',
      fixtureId: 7,
      seq: 12,
      minute: 30,
      payload: { teamId: 1, side: 'home', matchPhase: 'first_half' },
    })
    expect(normalized.side).toBe('home')
    expect(normalized.matchPhase).toBe('first_half')
  })

  it('lifts side and matchPhase from the REST metadata shape', () => {
    const normalized = normalizeLiveEvent({
      event_type: 'foul',
      fixture_id: 7,
      minute: 55,
      metadata: { teamId: 2, side: 'away', matchPhase: 'second_half' },
    })
    expect(normalized.side).toBe('away')
    expect(normalized.matchPhase).toBe('second_half')
  })

  it('normalizes an invalid side to null', () => {
    const normalized = normalizeLiveEvent({
      type: 'goal',
      fixtureId: 7,
      payload: { side: 'left-wing' },
    })
    expect(normalized.side).toBeNull()
  })

  it('defaults side and matchPhase to null on old events', () => {
    const normalized = normalizeLiveEvent({ type: 'goal', fixtureId: 7, minute: 10 })
    expect(normalized.side).toBeNull()
    expect(normalized.matchPhase).toBeNull()
  })

  it('does not clobber the chain micro `phase` key', () => {
    const normalized = normalizeLiveEvent({
      type: 'goal_build_up',
      fixtureId: 7,
      payload: { phase: 'push_forward', matchPhase: 'first_half' },
    })
    expect(normalized.phase).toBe('push_forward')
    expect(normalized.matchPhase).toBe('first_half')
  })

  it('structured side beats contradictory description text (flow events)', () => {
    // Description names the away team, but the backend says home.
    const event = {
      type: 'build_up_play',
      side: 'home',
      teamId: 1,
      description: 'Airway City push forward through midfield.',
    }
    const { team, side } = reconcileEventTeamWithDescription(event, ctx, event.description)
    expect(side).toBe('home')
    expect(team.name).toBe('Metro City')
  })

  it('events without side still use the description fallback', () => {
    // Legacy event: teamId resolves to home, but the copy names the away
    // team — without a structured side the description override must still
    // correct the resolution (pre-Improvement-#2 behavior).
    const event = {
      type: 'build_up_play',
      teamId: 1,
      description: 'Airway City push forward through midfield.',
    }
    const { side } = reconcileEventTeamWithDescription(event, ctx, event.description)
    expect(side).toBe('away')
  })

  it('breakdown events with side derive parties without description regexes', () => {
    // Reworded copy the legacy regex cannot parse; side (defender) present.
    const event = {
      type: 'attack_breakdown',
      side: 'away',
      teamId: 2,
      description: 'A crunching challenge halts the move.',
    }
    const parties = resolveBreakdownParties(event, ctx, event.description)
    expect(parties.defendingSide).toBe('away')
    expect(parties.defendingTeam.name).toBe('Airway City')
    expect(parties.possessionSide).toBe('home')
    expect(parties.possessionTeam.name).toBe('Metro City')
  })

  it('breakdown events without side still parse the legacy description', () => {
    const event = {
      type: 'attack_breakdown',
      description: "Airway City shut down Metro City's attack.",
    }
    const parties = resolveBreakdownParties(event, ctx, event.description)
    expect(parties.defendingSide).toBe('away')
    expect(parties.possessionSide).toBe('home')
  })
})

describe('running penaltyScore on shootout events', () => {
  it('applies penaltyScore from all shootout event types when present', () => {
    for (const type of [
      'shootout_goal',
      'shootout_save',
      'shootout_miss',
      'shootout_walkup',
      'shootout_reaction',
    ]) {
      const event = { type, penaltyScore: { home: 2, away: 1 } }
      expect(canApplyPenaltyScoreFromEvent(event)).toBe(true)
    }
  })

  it('no-ops for old shootout events without penaltyScore', () => {
    for (const type of ['shootout_save', 'shootout_miss', 'shootout_walkup', 'shootout_reaction']) {
      expect(canApplyPenaltyScoreFromEvent({ type })).toBe(false)
      expect(canApplyPenaltyScoreFromEvent({ type, shootoutScore: { home: 1, away: 0 } })).toBe(false)
    }
  })

  it('never applies penaltyScore from non-shootout types', () => {
    expect(canApplyPenaltyScoreFromEvent({ type: 'goal', penaltyScore: { home: 1, away: 0 } })).toBe(false)
  })
})

describe('getLatestMatchPhaseFromEvents', () => {
  it('returns the phase of the newest event carrying one', () => {
    const phase = getLatestMatchPhaseFromEvents([
      { type: 'goal', seq: 10, minute: 30, matchPhase: 'first_half' },
      { type: 'shootout_goal', seq: 50, minute: 120, matchPhase: 'penalty_shootout' },
      { type: 'foul', seq: 30, minute: 70, matchPhase: 'second_half' },
    ])
    expect(phase).toBe('penalty_shootout')
  })

  it('ignores events without matchPhase (mixed old/new lists)', () => {
    const phase = getLatestMatchPhaseFromEvents([
      { type: 'goal', seq: 99, minute: 80 }, // newest, but old event
      { type: 'foul', seq: 30, minute: 70, matchPhase: 'second_half' },
    ])
    expect(phase).toBe('second_half')
  })

  it('returns null for empty lists or lists without phases', () => {
    expect(getLatestMatchPhaseFromEvents([])).toBeNull()
    expect(getLatestMatchPhaseFromEvents(null)).toBeNull()
    expect(getLatestMatchPhaseFromEvents([{ type: 'goal', seq: 1 }])).toBeNull()
  })
})

describe('match_observation events (CommentaryEngine)', () => {
  const rawObservation = {
    seq: 77,
    type: 'match_observation',
    fixtureId: 10,
    minute: 62,
    scope: 'match',
    payload: {
      subtype: 'pressure',
      severity: 'medium',
      teamId: 1,
      side: 'home',
      matchPhase: 'second_half',
      description: 'Metro City are having a good spell here. They look dangerous.',
      score: { home: 1, away: 1 },
    },
  }

  it('normalizes match_observation with subtype/severity/side/matchPhase', () => {
    const n = normalizeLiveEvent(rawObservation)
    expect(n.type).toBe('match_observation')
    expect(n.subtype).toBe('pressure')
    expect(n.severity).toBe('medium')
    expect(n.side).toBe('home')
    expect(n.matchPhase).toBe('second_half')
    expect(n.minute).toBe(62)
    expect(n.description).toContain('Metro City')
  })

  it('is listed in LIVE_SSE_EVENT_TYPES', () => {
    expect(LIVE_SSE_EVENT_TYPES).toContain('match_observation')
  })

  it('getObservationDisplay returns backend text + subtype label', () => {
    const n = normalizeLiveEvent(rawObservation)
    expect(isMatchObservationEvent(n)).toBe(true)
    const display = getObservationDisplay(n)
    expect(display.text).toBe(
      'Metro City are having a good spell here. They look dangerous.'
    )
    expect(display.subtypeLabel).toBe('Pressure')
  })

  it('unknown future subtypes fall back to a safe label', () => {
    const n = normalizeLiveEvent({
      ...rawObservation,
      payload: { ...rawObservation.payload, subtype: 'brand_new_subtype' },
    })
    const display = getObservationDisplay(n)
    expect(display.subtypeLabel).toBe('Analysis')
    expect(display.text.length).toBeGreaterThan(0)
  })

  it('getObservationDisplay returns null for non-observation events', () => {
    expect(getObservationDisplay(normalizeLiveEvent({ type: 'goal', seq: 1 }))).toBeNull()
    expect(getObservationDisplay(null)).toBeNull()
  })

  it('never applies score or penalty score from observations', () => {
    const n = normalizeLiveEvent(rawObservation)
    expect(canApplyMatchScoreFromEvent(n)).toBe(false)
    expect(canApplyPenaltyScoreFromEvent(n)).toBe(false)
  })

  it('does not disturb score resolution in a mixed feed', () => {
    const events = [
      normalizeLiveEvent({
        ...rawObservation,
        seq: 90,
        payload: { ...rawObservation.payload, score: { home: 9, away: 9 } },
      }),
      normalizeLiveEvent({
        type: 'goal',
        seq: 80,
        fixtureId: 10,
        minute: 60,
        payload: { score: { home: 1, away: 1 }, teamId: 1 },
      }),
    ]
    const { score } = getDisplayScoresFromEvents(events, null, null)
    expect(score).toEqual({ home: 1, away: 1 })
  })

  it('unknown future event types still normalize safely', () => {
    const n = normalizeLiveEvent({
      type: 'half_time_show',
      seq: 5,
      fixtureId: 3,
      minute: 45,
      payload: { description: 'something new' },
    })
    expect(n).not.toBeNull()
    expect(n.type).toBe('half_time_show')
    expect(n.description).toBe('something new')
    expect(isMatchObservationEvent(n)).toBe(false)
  })
})
