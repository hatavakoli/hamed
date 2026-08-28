import { describe, expect, it } from 'vitest'
import { computeChannelInsights, detectTitlePattern, type ReportLike } from '@/lib/insights'
import { average, formatDuration, parseIsoDuration, startOfWeekUtc, truncate } from '@/lib/utils'

function report(overrides: Partial<ReportLike> & { title: string; score: number; format?: string }): ReportLike {
  return {
    overallScore: overrides.score,
    generatedAt: overrides.generatedAt ?? new Date('2025-01-01'),
    videoTitle: overrides.title,
    publishedAt: new Date('2025-01-01'),
    structuredData: {
      coreTopic: 'saas validation pricing',
      format: { primary: overrides.format ?? 'case_study' },
      scorecard: { topicStrength: overrides.score, overall: overrides.score },
      executiveSummary: { summary: 's', verdict: 'strong', mostImportantTakeaway: 't', topTakeaways: [] },
      productValidation: { productIdea: 'A complaint clustering tool', buildVerdict: 'build' },
    },
  }
}

describe('detectTitlePattern', () => {
  it('classifies common YouTube title shapes', () => {
    expect(detectTitlePattern('7 Ways To Grow Faster')).toBe('Numbered list')
    expect(detectTitlePattern('How To Find Your First Customer')).toBe('"How to / How I"')
    expect(detectTitlePattern('Why Most Startups Fail')).toBe('"Why ..."')
    expect(detectTitlePattern('I Built A SaaS In 7 Days')).toBe('First-person experiment')
    expect(detectTitlePattern('Notion vs Obsidian')).toBe('Comparison')
    expect(detectTitlePattern('Is This The Best Tool?')).toBe('Question')
    expect(detectTitlePattern('Stop Building Features')).toBe('Contrarian / warning')
  })
})

describe('computeChannelInsights', () => {
  it('returns an empty shape with no reports', () => {
    const insights = computeChannelInsights([])
    expect(insights.reportCount).toBe(0)
    expect(insights.averageOverall).toBeNull()
    expect(insights.recentTrend.direction).toBe('flat')
  })

  it('counts formats, topics and title patterns', () => {
    const insights = computeChannelInsights([
      report({ title: 'How To Validate An Idea', score: 8 }),
      report({ title: 'How To Price A Product', score: 6 }),
      report({ title: '5 Growth Channels', score: 7, format: 'listicle' }),
    ])
    expect(insights.reportCount).toBe(3)
    expect(insights.commonFormats[0]).toEqual({ label: 'Case study', count: 2 })
    expect(insights.titlePatterns[0]).toEqual({ label: '"How to / How I"', count: 2 })
    expect(insights.commonTopics.map((t) => t.label)).toContain('validation')
    expect(insights.averageOverall).toBe(7)
  })

  it('identifies the strongest and weakest videos', () => {
    const insights = computeChannelInsights([
      report({ title: 'Great one', score: 9 }),
      report({ title: 'Poor one', score: 3 }),
    ])
    expect(insights.strongestVideo).toEqual({ title: 'Great one', score: 9 })
    expect(insights.weakestVideo).toEqual({ title: 'Poor one', score: 3 })
  })

  it('detects an upward score trend across time', () => {
    const insights = computeChannelInsights([
      report({ title: 'Old A', score: 4, generatedAt: new Date('2025-01-01') }),
      report({ title: 'Old B', score: 5, generatedAt: new Date('2025-01-02') }),
      report({ title: 'New A', score: 8, generatedAt: new Date('2025-01-10') }),
      report({ title: 'New B', score: 9, generatedAt: new Date('2025-01-11') }),
    ])
    expect(insights.recentTrend.direction).toBe('up')
    expect(insights.recentTrend.delta).toBe(4)
  })

  it('collects product ideas worth building', () => {
    const insights = computeChannelInsights([report({ title: 'Idea video', score: 8 })])
    expect(insights.buildWorthyIdeas[0]).toMatchObject({ verdict: 'build' })
  })
})

describe('utils', () => {
  it('parses ISO 8601 durations', () => {
    expect(parseIsoDuration('PT1H2M30S')).toBe(3750)
    expect(parseIsoDuration('PT45S')).toBe(45)
    expect(parseIsoDuration('P1DT2H')).toBe(93600)
    expect(parseIsoDuration(null)).toBeNull()
    expect(parseIsoDuration('garbage')).toBeNull()
  })

  it('formats durations', () => {
    expect(formatDuration(3750)).toBe('1:02:30')
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(null)).toBe('—')
  })

  it('averages and truncates', () => {
    expect(average([1, 2, 3])).toBe(2)
    expect(average([])).toBeNull()
    expect(truncate('abcdef', 4)).toBe('abc…')
  })

  it('finds the Monday of a week in UTC', () => {
    // 2025-01-01 is a Wednesday; its week starts Monday 2024-12-30.
    expect(startOfWeekUtc(new Date('2025-01-01T15:00:00Z')).toISOString()).toBe('2024-12-30T00:00:00.000Z')
    // A Monday maps to itself.
    expect(startOfWeekUtc(new Date('2024-12-30T23:59:00Z')).toISOString()).toBe('2024-12-30T00:00:00.000Z')
  })
})
