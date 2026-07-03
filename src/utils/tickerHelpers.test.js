import { describe, it, expect } from 'vitest'
import {
  getTeamName,
  sortFixturesByBracket,
  formatFixtureScore,
  formatRoundScores,
  formatNextRoundFixtures,
  isGoalTickerEvent,
  isIgnoredShootoutTickerEvent,
  isPenaltyShootoutStart,
  isShootoutWinnerEvent,
  buildGoalTickerMessage,
  buildPenaltiesStartMessage,
  buildShootoutWinnerMessage,
  buildHalftimeMessage,
  buildFulltimeMessage,
  buildRoundCompleteMessage,
  buildTickerMessageFromEvent,
  getGoalDedupeKey,
  getPensStartDedupeKey,
  getHalftimeDedupeKey,
  getRoundCompleteDedupeKey,
  buildMergedTickerText,
  TICKER_SEPARATOR,
  isRoundFixturesComplete,
} from './tickerHelpers'

const metro = { id: 1, name: 'Metro City' }
const greenBay = { id: 2, name: 'Green Bay' }

function makeFixture(overrides = {}) {
  return {
    fixtureId: 10,
    bracketSlot: 'A1',
    homeTeam: greenBay,
    awayTeam: metro,
    score: { home: 0, away: 2 },
    state: 'SECOND_HALF',
    ...overrides,
  }
}

describe('getTeamName', () => {
  it('resolves string and object shapes', () => {
    expect(getTeamName('Metro City')).toBe('Metro City')
    expect(getTeamName({ name: 'Virgin' })).toBe('Virgin')
    expect(getTeamName({ team_name: 'Port Hilo' })).toBe('Port Hilo')
  })
})

describe('formatFixtureScore', () => {
  it('formats basic score', () => {
    expect(formatFixtureScore(makeFixture())).toBe('Green Bay 0 - 2 Metro City')
  })

  it('adds HT suffix', () => {
    expect(formatFixtureScore(makeFixture({ state: 'HALFTIME' }))).toContain('(HT)')
  })

  it('adds FT suffix when finished', () => {
    expect(
      formatFixtureScore(makeFixture({ state: 'FINISHED', isFinished: true })),
    ).toContain('(FT)')
  })

  it('adds pens in progress without live pen tally', () => {
    const text = formatFixtureScore(
      makeFixture({
        state: 'PENALTIES',
        score: { home: 1, away: 1 },
        penaltyScore: { home: 2, away: 3 },
      }),
    )
    expect(text).toContain('(pens in progress)')
    expect(text).not.toMatch(/\(2-3\)/)
  })
})

describe('formatRoundScores and next round', () => {
  it('joins fixtures in bracket order with separator', () => {
    const fixtures = [
      makeFixture({ fixtureId: 2, bracketSlot: 'B1', homeTeam: { name: 'Airway City' }, awayTeam: { name: 'Virgin' }, score: { home: 0, away: 0 } }),
      makeFixture({ fixtureId: 1, bracketSlot: 'A1' }),
    ]
    const text = formatRoundScores(fixtures)
    expect(text).toContain('Green Bay 0 - 2 Metro City')
    expect(text).toContain(TICKER_SEPARATOR)
    expect(text.indexOf('Green Bay')).toBeLessThan(text.indexOf('Airway'))
  })

  it('formats next round fixtures', () => {
    const text = formatNextRoundFixtures([
      makeFixture({ homeTeam: metro, awayTeam: { name: 'Virgin' } }),
      makeFixture({ fixtureId: 11, bracketSlot: 'B1', homeTeam: greenBay, awayTeam: { name: 'Port Hilo' } }),
    ])
    expect(text).toMatch(/^Next round:/)
    expect(text).toContain('Metro City vs Virgin')
  })
})

describe('goal vs shootout events', () => {
  it('treats normal goal as ticker goal', () => {
    expect(isGoalTickerEvent({ type: 'goal' }, makeFixture())).toBe(true)
  })

  it('treats in-match penalty_scored as ticker goal', () => {
    expect(isGoalTickerEvent({ type: 'penalty_scored' }, makeFixture())).toBe(true)
  })

  it('ignores shootout_goal', () => {
    expect(isIgnoredShootoutTickerEvent({ type: 'shootout_goal' })).toBe(true)
    expect(isGoalTickerEvent({ type: 'shootout_goal' }, makeFixture())).toBe(false)
  })

  it('ignores penalty_scored during penalty shootout state', () => {
    expect(
      isGoalTickerEvent(
        { type: 'penalty_scored' },
        makeFixture({ state: 'PENALTIES' }),
      ),
    ).toBe(false)
  })
})

describe('message builders', () => {
  it('builds goal message with latest fixture score and separator', () => {
    const fixture = makeFixture({ score: { home: 0, away: 2 } })
    const built = buildGoalTickerMessage(
      { type: 'goal', teamName: 'Metro City', score: { home: 0, away: 1 } },
      fixture,
      [fixture],
    )
    expect(built.goalPart).toBe('Goal Metro City!')
    expect(built.scorePart).toBe('Green Bay 0 - 2 Metro City')
    expect(built.text).toBe('Goal Metro City! • Green Bay 0 - 2 Metro City')
  })

  it('builds penalties start message', () => {
    expect(buildPenaltiesStartMessage(makeFixture())).toBe(
      'PENALTIES: Green Bay vs Metro City has gone to penalties',
    )
  })

  it('builds shootout winner with pens', () => {
    const fixture = makeFixture({
      state: 'FINISHED',
      score: { home: 1, away: 1 },
      penaltyScore: { home: 3, away: 4 },
      winnerId: 1,
    })
    const msg = buildShootoutWinnerMessage(fixture, { type: 'shootout_end' })
    expect(msg).toBe(
      'METRO CITY WIN ON PENALTIES! Green Bay 1 - 1 Metro City, pens 3 - 4',
    )
  })

  it('builds shootout winner fallback without pens', () => {
    const fixture = makeFixture({
      winnerId: 1,
      homeTeam: greenBay,
      awayTeam: metro,
    })
    expect(buildShootoutWinnerMessage(fixture, { type: 'shootout_end' })).toBe(
      'METRO CITY WIN ON PENALTIES!',
    )
  })

  it('builds half-time and full-time summaries', () => {
    const fixtures = [makeFixture(), makeFixture({ fixtureId: 11, bracketSlot: 'B1', homeTeam: { name: 'Airway' }, awayTeam: { name: 'Virgin' }, score: { home: 0, away: 0 } })]
    expect(buildHalftimeMessage(fixtures)).toMatch(/^HALF-TIME:/)
    expect(buildFulltimeMessage(fixtures)).toMatch(/^FULL-TIME:/)
    expect(buildRoundCompleteMessage(fixtures)).toMatch(/^ROUND COMPLETE:/)
  })
})

describe('buildTickerMessageFromEvent', () => {
  it('returns goal announcement for goal event', () => {
    const fixture = makeFixture()
    const result = buildTickerMessageFromEvent(
      { type: 'goal', seq: 5, teamName: 'Metro City' },
      fixture,
      [fixture],
      'Quarter-finals',
    )
    expect(result?.message).toContain('Goal Metro City')
    expect(result?.dedupeKey).toBe(getGoalDedupeKey({ type: 'goal', seq: 5 }))
  })

  it('returns null for shootout_goal', () => {
    expect(
      buildTickerMessageFromEvent({ type: 'shootout_goal' }, makeFixture(), [], 'Final'),
    ).toBeNull()
  })

  it('detects penalty shootout start', () => {
    const result = buildTickerMessageFromEvent(
      { type: 'shootout_start', fixtureId: 10 },
      makeFixture({ state: 'PENALTIES' }),
      [makeFixture({ state: 'PENALTIES' })],
      'Final',
    )
    expect(result?.message).toContain('PENALTIES:')
    expect(result?.dedupeKey).toBe(getPensStartDedupeKey(10))
  })
})

describe('dedupe keys', () => {
  it('uses stable round keys', () => {
    expect(getHalftimeDedupeKey('Semi-finals')).toBe('halftime:Semi-finals')
    expect(getRoundCompleteDedupeKey('Final')).toBe('round-complete:Final')
  })
})

describe('buildMergedTickerText', () => {
  it('prepends temporary messages before base', () => {
    const text = buildMergedTickerText('Base scores', [
      { text: 'GOAL!', priority: 0, insertedAt: 2 },
      { text: 'PENALTIES: x', priority: 1, insertedAt: 1 },
    ])
    expect(text.startsWith('GOAL!')).toBe(true)
    expect(text).toContain('Base scores')
  })
})

describe('isRoundFixturesComplete', () => {
  it('returns true when all fixtures finished', () => {
    expect(
      isRoundFixturesComplete([
        makeFixture({ state: 'FINISHED', isFinished: true }),
      ]),
    ).toBe(true)
  })
})

describe('sortFixturesByBracket', () => {
  it('sorts by bracketSlot', () => {
    const sorted = sortFixturesByBracket([
      { fixtureId: 2, bracketSlot: 'B1' },
      { fixtureId: 1, bracketSlot: 'A1' },
    ])
    expect(sorted[0].bracketSlot).toBe('A1')
  })
})

describe('isShootoutWinnerEvent', () => {
  it('detects shootout_end', () => {
    expect(isShootoutWinnerEvent({ type: 'shootout_end' }, makeFixture())).toBe(true)
  })

  it('detects match_end with penalty winner', () => {
    const fixture = makeFixture({
      state: 'FINISHED',
      score: { home: 1, away: 1 },
      penaltyScore: { home: 3, away: 4 },
    })
    expect(isShootoutWinnerEvent({ type: 'match_end' }, fixture)).toBe(true)
  })
})

describe('isPenaltyShootoutStart', () => {
  it('detects status transition to PENALTIES', () => {
    const prev = makeFixture({ state: 'EXTRA_TIME_2' })
    const next = makeFixture({ state: 'PENALTIES' })
    expect(isPenaltyShootoutStart({}, next, prev)).toBe(true)
  })
})

describe('match_observation ticker exclusion', () => {
  it('buildTickerMessageFromEvent returns null for match_observation', () => {
    const fixture = makeFixture()
    const observation = {
      type: 'match_observation',
      seq: 42,
      fixtureId: fixture.fixtureId,
      minute: 60,
      subtype: 'pressure',
      side: 'home',
      teamId: 1,
      description: 'Metro City are having a good spell here.',
      score: { home: 1, away: 0 },
    }
    expect(buildTickerMessageFromEvent(observation, fixture, [fixture])).toBeNull()
  })

  it('match_observation is not a goal ticker event', () => {
    expect(
      isGoalTickerEvent({ type: 'match_observation', subtype: 'scoreline' }, makeFixture()),
    ).toBe(false)
  })
})
