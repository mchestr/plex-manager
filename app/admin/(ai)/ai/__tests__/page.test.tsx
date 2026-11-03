/**
 * The AI activity page (spec §2): Calls and Findings tabs kept in
 * `?view=findings`, the Calls rows' review badges from `reviewBadgesFor`,
 * and the Findings filters read from the URL into `FindingFilters` (status
 * open and Hide unverified by default) for the list, the groups and the
 * stat tiles.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { currentHref, resetUrl } from '@/__tests__/helpers/url-router'
import { findingRow } from '@/components/admin/ai-activity/findings/__tests__/findings-fixtures'
import AIActivityPage from '@/app/admin/(ai)/ai/page'
import { getUsageFilterOptions, listUsageGroups, type LlmUsageGroupRow } from '@/lib/admin/analytics/llm-usage'
import { findingStats, groupFindings, listFindings } from '@/lib/data/conversation-findings'
import { reviewBadgesFor } from '@/lib/data/conversation-review'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/lib/admin', () => ({ assertAdmin: jest.fn() }))
jest.mock('@/lib/admin/analytics/llm-usage', () => ({
  ...jest.requireActual('@/lib/admin/analytics/llm-usage'),
  listUsageGroups: jest.fn(),
  getUsageFilterOptions: jest.fn(),
}))
jest.mock('@/lib/data/conversation-findings', () => ({ listFindings: jest.fn(), groupFindings: jest.fn(), findingStats: jest.fn() }))
jest.mock('@/lib/data/conversation-review', () => ({ reviewBadgesFor: jest.fn() }))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormat: async () => (await import('@/lib/utils/format')).bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' }),
}))

const ZONE = 'America/Chicago'

function usageRow(key: string, conversationId: string | null): LlmUsageGroupRow {
  return {
    key,
    href: conversationId ? `/admin/ai/conversation/${conversationId}` : `/admin/ai/${key}`,
    userId: 'u1',
    memberName: 'Ana',
    startedAt: '2026-10-17T10:00:00.000Z',
    calls: 1,
    model: 'gpt-5-mini',
    tokens: 10,
    cost: 0.01,
    context: conversationId ? 'Assistant conversation, 1 call' : 'Conversation review',
    conversationId,
  }
}

async function renderPage(query = '') {
  resetUrl(`/admin/ai${query ? `?${query}` : ''}`)
  const params = Object.fromEntries(new URLSearchParams(query))
  const ui = await AIActivityPage({ searchParams: Promise.resolve(params) })
  return render(<>{ui}</>)
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listUsageGroups).mockResolvedValue({ rows: [], total: 0, totals: { calls: 0, tokens: 0, cost: 0 } })
  jest.mocked(getUsageFilterOptions).mockResolvedValue({ members: [], models: [] })
  jest.mocked(reviewBadgesFor).mockResolvedValue(new Map())
  jest.mocked(listFindings).mockResolvedValue({ rows: [findingRow({ id: 'f1' })], total: 1, hiddenUnverified: 2 })
  jest.mocked(groupFindings).mockResolvedValue([])
  jest.mocked(findingStats).mockResolvedValue({ open: 5, fixed: 1, falseAlarmRate: 0.5 })
})

describe('AI activity page', () => {
  it('opens on Calls, with no finding loaded', async () => {
    await renderPage()
    expect(screen.getByTestId('ai-activity-tab-calls')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('ai-activity')).toBeInTheDocument()
    expect(listFindings).not.toHaveBeenCalled()
    expect(findingStats).not.toHaveBeenCalled()
  })

  it('view=findings selects the tab', async () => {
    await renderPage('view=findings')
    expect(screen.getByTestId('ai-activity-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('ai-activity-tab-findings')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('findings-filters')).toBeInTheDocument()
    expect(screen.getByTestId('findings-table-row-f1')).toBeInTheDocument()
    expect(listUsageGroups).not.toHaveBeenCalled()
  })

  it('switching tabs keeps the date range and drops the other tab’s filters', async () => {
    const user = userEvent.setup()
    await renderPage('userId=u1&from=2026-10-01&to=2026-10-31')
    await user.click(screen.getByTestId('ai-activity-tab-findings'))
    expect(currentHref()).toBe('/admin/ai?view=findings&from=2026-10-01&to=2026-10-31')
  })

  it('default filters status open and hide unverified', async () => {
    await renderPage('view=findings')
    expect(listFindings).toHaveBeenCalledWith(
      { status: 'open', type: undefined, severity: undefined, tool: undefined, hideUnverified: true, range: null },
      ZONE,
      { page: 1, pageSize: 25 }
    )
    expect(screen.getByTestId('findings-hide-unverified')).toHaveAccessibleName('Hide unverified (2)')

    jest.clearAllMocks()
    await renderPage('view=findings&status=all&unverified=show&type=nonsense')
    expect(jest.mocked(listFindings).mock.calls[0][0]).toMatchObject({ status: undefined, type: undefined, hideUnverified: false })
  })

  it('the severity filter narrows the list and the stat tiles', async () => {
    await renderPage('view=findings&severity=high&type=wrong_tool&status=fixed&from=2026-10-01&to=2026-10-31')
    const filters = { status: 'fixed', type: 'wrong_tool', severity: 'high', tool: undefined, hideUnverified: true, range: { from: '2026-10-01', to: '2026-10-31' } }
    expect(listFindings).toHaveBeenCalledWith(filters, ZONE, { page: 1, pageSize: 25 })
    expect(findingStats).toHaveBeenCalledWith(filters, ZONE)
    expect(screen.getByTestId('findings-stat-open')).toHaveTextContent('5')
    expect(screen.getByTestId('findings-stat-fixed')).toHaveTextContent('1')
    expect(screen.getByTestId('findings-stat-false-alarm')).toHaveTextContent('50.0%')
  })

  it('reads a group link: a tool, or no tool', async () => {
    await renderPage('view=findings&type=wrong_tool&tool=get_users')
    expect(jest.mocked(listFindings).mock.calls[0][0]).toMatchObject({ type: 'wrong_tool', tool: 'get_users' })

    jest.clearAllMocks()
    await renderPage('view=findings&type=misread_question&tool=')
    expect(jest.mocked(listFindings).mock.calls[0][0]).toMatchObject({ type: 'misread_question', tool: null })
  })

  it('group=type-tool loads the groups instead of the list', async () => {
    jest.mocked(groupFindings).mockResolvedValue([{ type: 'wrong_tool', tool: 'get_users', open: 2, conversations: 1, latest: new Date('2026-10-20T12:00:00Z') }])
    await renderPage('view=findings&group=type-tool&severity=low')
    expect(groupFindings).toHaveBeenCalledWith(expect.objectContaining({ severity: 'low' }), ZONE)
    expect(listFindings).not.toHaveBeenCalled()
    expect(screen.getByTestId('findings-groups-row-wrong_tool-get_users')).toBeInTheDocument()
  })

  it("the page passes reviewBadgesFor's badges for the Calls rows' conversationIds to UsageTable", async () => {
    jest.mocked(listUsageGroups).mockResolvedValue({
      rows: [usageRow('c1', 'c1'), usageRow('judge-1', null), usageRow('c2', 'c2')],
      total: 3,
      totals: { calls: 3, tokens: 30, cost: 0.03 },
    })
    jest.mocked(reviewBadgesFor).mockResolvedValue(
      new Map([
        ['c1', { state: 'open', open: 2 }],
        ['c2', { state: 'none', open: 0 }],
      ])
    )
    await renderPage()

    expect(reviewBadgesFor).toHaveBeenCalledWith(['c1', 'c2'])
    expect(screen.getByTestId('usage-row-review-badge-c1')).toHaveTextContent('2 open')
    expect(screen.getByTestId('usage-row-review-badge-c2')).toHaveTextContent('Not reviewed')
    expect(screen.queryByTestId('usage-row-review-badge-judge-1')).not.toBeInTheDocument()
  })

  it('purpose filter judge lists review calls', async () => {
    await renderPage('purpose=judge')
    expect(jest.mocked(listUsageGroups).mock.calls[0][0]).toMatchObject({ purpose: 'judge' })
  })
})
