/**
 * The Calls rows' review badges (spec §2): "Not reviewed" without a finished
 * review, "No findings", "N open" (verified and not_applicable only) and
 * "Unverified only", on admin assistant conversation rows. The last test
 * runs one stored state through both loaders, so the Calls badge and the
 * conversation page cannot disagree.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockReset } from 'jest-mock-extended'

import { buildConversationFinding } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { resetUrl } from '@/__tests__/helpers/url-router'
import { FindingCard } from '@/components/admin/ai-activity/review/finding-card'
import { UsageTable } from '@/components/admin/ai-activity/usage-table'
import { assertAdmin } from '@/lib/admin'
import type { LlmUsageGroupRow } from '@/lib/admin/analytics/llm-usage'
import { getConversationReview, reviewBadgesFor, type ReviewBadge } from '@/lib/data/conversation-review'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/admin', () => ({ assertAdmin: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ auditMemberRead: jest.fn() }))
jest.mock('@/actions/admin/conversation-review', () => ({ setFindingStatus: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const reviewGroupBy = prismaMock.conversationReview.groupBy as jest.Mock
const findingGroupBy = prismaMock.conversationFinding.groupBy as jest.Mock

function usageRow(key: string, conversationId: string | null, context = 'Assistant conversation, 2 calls'): LlmUsageGroupRow {
  return {
    key,
    href: conversationId ? `/admin/ai/conversation/${conversationId}` : `/admin/ai/${key}`,
    userId: 'u1',
    memberName: 'Ana',
    startedAt: '2026-10-17T10:00:00.000Z',
    calls: 2,
    model: 'gpt-5-mini',
    tokens: 100,
    cost: 0.01,
    context,
    conversationId,
  }
}

function renderTable(rows: LlmUsageGroupRow[], badges: Record<string, ReviewBadge>) {
  return render(
    <UsageTable rows={rows} badges={badges} total={rows.length} page={1} pageSize={25} filtered={false} options={{ members: [], models: [] }} zone="UTC" />
  )
}

beforeEach(() => {
  resetUrl('/admin/ai')
  mockReset(prismaMock)
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: 'admin-1' } } as never)
})

describe('Calls review badges', () => {
  it('badge reads Not reviewed / No findings / N open / Unverified only', () => {
    renderTable(
      [usageRow('c-none', 'c-none'), usageRow('c-clean', 'c-clean'), usageRow('c-open', 'c-open'), usageRow('c-unverified', 'c-unverified')],
      {
        'c-none': { state: 'none', open: 0 },
        'c-clean': { state: 'clean', open: 0 },
        'c-open': { state: 'open', open: 3 },
        'c-unverified': { state: 'unverified_only', open: 0 },
      }
    )

    expect(screen.getByTestId('usage-row-review-badge-c-none')).toHaveTextContent('Not reviewed')
    expect(screen.getByTestId('usage-row-review-badge-c-clean')).toHaveTextContent('No findings')
    expect(screen.getByTestId('usage-row-review-badge-c-open')).toHaveTextContent('3 open')
    expect(screen.getByTestId('usage-row-review-badge-c-unverified')).toHaveTextContent('Unverified only')
  })

  it('leaves the badge off rows without a conversationId or a badge', () => {
    renderTable([usageRow('judge-1', null, 'Conversation review'), usageRow('c-missing', 'c-missing')], {})
    expect(screen.queryByTestId(/^usage-row-review-badge-/)).not.toBeInTheDocument()
  })

  it('offers the judge purpose as "Conversation review"', async () => {
    const user = userEvent.setup()
    renderTable([], {})
    await user.click(screen.getByTestId('ai-activity-filters-filter-purpose'))
    expect(await screen.findByTestId('ai-activity-filters-filter-purpose-option-judge')).toHaveTextContent('Conversation review')
  })

  it('badge and conversation page agree', async () => {
    // One done review, and its only open finding has a quote that did not check out
    const finding = buildConversationFinding({ id: 'f1', conversationId: 'conv-1', messageId: 'm2', evidenceCheck: 'unverified' })
    reviewGroupBy.mockResolvedValue([{ conversationId: 'conv-1' }])
    findingGroupBy.mockResolvedValue([{ conversationId: 'conv-1', evidenceCheck: 'unverified', _count: { _all: 1 } }])
    // Still open, so still in review scope
    prismaMock.chatConversation.findMany.mockResolvedValue([{ id: 'conv-1' }] as never)
    prismaMock.chatConversation.findUnique.mockResolvedValue({ userId: 'member-1' } as never)
    prismaMock.conversationReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'done' } as never)
    prismaMock.chatConversationMessage.findMany.mockImplementation(((args: { where: { id?: unknown } }) =>
      Promise.resolve(
        args.where.id ? [{ id: 'm2', role: 'assistant', content: 'Twelve.' }] : [{ id: 'm1' }, { id: 'm2' }]
      )) as never)
    prismaMock.conversationFinding.findMany.mockResolvedValue([finding])
    prismaMock.chatConversationMessage.count.mockResolvedValue(1)
    prismaMock.lLMProvider.findFirst.mockResolvedValue({ id: 'judge-1' } as never)
    prismaMock.chatConversation.findFirst.mockResolvedValue({ id: 'conv-1' } as never)
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 0.01 } } as never)

    const badges = Object.fromEntries(await reviewBadgesFor(['conv-1']))
    const { unmount } = renderTable([usageRow('conv-1', 'conv-1')], badges)
    expect(screen.getByTestId('usage-row-review-badge-conv-1')).toHaveTextContent('Unverified only')
    unmount()

    const { findings } = await getConversationReview('conv-1')
    expect(findings).toHaveLength(1)
    render(<FindingCard finding={findings[0]} />)
    expect(screen.getByTestId('finding-card-f1')).toBeInTheDocument()
    expect(screen.getByTestId('finding-unverified-f1')).toHaveTextContent('Unverified quote')
  })
})
