/**
 * The conversation page's Review section (spec §2, "Conversation page"): the
 * button, the status as a StatusBadge with a Spinner, the 5 s poll while a
 * review is queued or running (and never after it ends), the summary, the
 * coded failure copy, and every finding in the order the loader gives.
 */

import { act, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { getConversationReviewStatus, reviewConversation } from '@/actions/admin/conversation-review'
import { reviewFinding } from '@/components/admin/ai-activity/review/__tests__/review-fixtures'
import { ReviewSection } from '@/components/admin/ai-activity/review/review-section'
import type { ReviewView } from '@/lib/data/conversation-review'
import { createQueryWrapper } from '@/__tests__/helpers/query-client'

jest.mock('@/actions/admin/conversation-review', () => ({
  reviewConversation: jest.fn(),
  getConversationReviewStatus: jest.fn(),
  setFindingStatus: jest.fn(),
}))

const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showError: mockShowError, showSuccess: jest.fn() }) }))

const getStatus = jest.mocked(getConversationReviewStatus)
const review = jest.mocked(reviewConversation)

function view(overrides: Partial<ReviewView> = {}): ReviewView {
  return {
    id: 'review-1',
    status: 'done',
    errorCode: null,
    trigger: 'manual',
    model: 'gpt-5-mini',
    cost: 0.0123,
    reviewedThrough: new Date('2026-10-12T19:30:00Z'),
    completedAt: new Date('2026-10-12T19:31:00Z'),
    summary: 'Two answers <b>miscounted</b> the libraries.',
    ...overrides,
  }
}

type Props = Partial<Parameters<typeof ReviewSection>[0]>

function render(props: Props = {}) {
  return rtlRender(
    <ReviewSection conversationId="chat-1" review={null} findings={[]} hasToolEvidence judgeConfigured llmDisabled={false} {...props} />,
    { wrapper: createQueryWrapper() }
  )
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

/** A settled poll reaches React a moment later; `waitFor` moves the fake clock in 50 ms steps until it has. */
const badgeReads = (text: string) => waitFor(() => expect(screen.getByTestId('conversation-review-status')).toHaveTextContent(text))

const status = (value: 'queued' | 'running' | 'done' | 'failed', errorCode: string | null = null) =>
  ({ success: true, data: { reviewId: 'review-1', status: value, errorCode } }) as const

beforeEach(() => jest.clearAllMocks())

describe('ReviewSection states', () => {
  it('offers a first review when the conversation has none', () => {
    render()

    expect(screen.getByTestId('conversation-review-section')).toBeInTheDocument()
    expect(screen.getByTestId('conversation-review-status')).toHaveTextContent('Not reviewed')
    expect(screen.getByTestId('conversation-review-button')).toHaveTextContent('Review')
    expect(screen.getByTestId('conversation-review-button')).not.toHaveTextContent('Review again')
    expect(screen.getByTestId('conversation-review-button')).toBeEnabled()
  })

  it.each(['queued', 'running'] as const)('shows a %s review as a StatusBadge with a Spinner', (value) => {
    render({ review: view({ status: value, completedAt: null, summary: null, model: null }) })

    const badge = screen.getByTestId('conversation-review-status')
    expect(badge).toHaveTextContent(value === 'queued' ? 'Queued' : 'Reviewing')
    expect(badge.querySelector('[data-slot="spinner"]')).not.toBeNull()
    // Review stays enabled: it returns the open review, or reaps a dead one and queues anew
    expect(screen.getByTestId('conversation-review-button')).toBeEnabled()
  })

  it('shows no failure copy for a queued review that carries a retried attempt\'s code', () => {
    render({ review: view({ status: 'queued', errorCode: 'PROVIDER', summary: null, completedAt: null }) })

    expect(screen.getByTestId('conversation-review-status')).toHaveTextContent('Queued')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a done review with its date, model, cost, summary and findings', () => {
    render({ review: view(), findings: [reviewFinding({ id: 'f1' })] })

    expect(screen.getByTestId('conversation-review-status')).toHaveTextContent('Reviewed')
    const section = screen.getByTestId('conversation-review-section')
    expect(section).toHaveTextContent('Oct 12, 2026')
    expect(section).toHaveTextContent('gpt-5-mini')
    expect(section).toHaveTextContent('$0.012')
    expect(screen.getByText('Two answers <b>miscounted</b> the libraries.')).toBeInTheDocument()
    expect(screen.getByTestId('finding-card-f1')).toBeInTheDocument()
    expect(screen.getByTestId('conversation-review-button')).toHaveTextContent('Review again')
  })

  it('says so when a done review found nothing', () => {
    render({ review: view({ summary: 'All good.' }) })

    expect(screen.getByText('No findings in this conversation.')).toBeInTheDocument()
    expect(screen.queryByTestId(/^finding-card-/)).not.toBeInTheDocument()
  })

  it('shows a failed review with its coded copy and Review again', () => {
    render({ review: view({ status: 'failed', errorCode: 'BUDGET_EXCEEDED', summary: null, completedAt: null }) })

    expect(screen.getByTestId('conversation-review-status')).toHaveTextContent('Failed')
    expect(screen.getByRole('alert')).toHaveTextContent('The Daily budget for conversation reviews is spent for today. Review again tomorrow.')
    expect(within(screen.getByRole('alert')).getByRole('link', { name: 'Raise it in Conversation review settings' })).toHaveAttribute(
      'href',
      '/admin/settings#conversation-review'
    )
    expect(screen.getByTestId('conversation-review-button')).toHaveTextContent('Review again')
    expect(screen.getByTestId('conversation-review-button')).toBeEnabled()
  })

  it('disables the button without a judge provider and links to the settings', () => {
    render({ judgeConfigured: false })

    expect(screen.getByTestId('conversation-review-button')).toBeDisabled()
    // The message ends before the link, so its words are not read twice
    expect(screen.getByTestId('conversation-review-blocked')).toHaveTextContent(
      'No conversation review model is set up. Set one up in AI settings, on the Conversation review tab'
    )
    const link = screen.getByRole('link', { name: 'Set one up in AI settings, on the Conversation review tab' })
    expect(link).toHaveAttribute('href', '/admin/settings#ai')
    expect(link).toHaveAttribute('data-testid', 'conversation-review-blocked-link')
  })

  it('disables the button while AI features are off and says so first, with a link to the AI settings', () => {
    render({ llmDisabled: true, judgeConfigured: false })

    expect(screen.getByTestId('conversation-review-button')).toBeDisabled()
    expect(screen.getByTestId('conversation-review-blocked')).toHaveTextContent('AI features are turned off. Turn them on in AI settings')
    // The master switch comes first, so the missing model is not mentioned beside it
    expect(screen.getByTestId('conversation-review-section')).not.toHaveTextContent('No conversation review model')
    expect(screen.getByTestId('conversation-review-blocked-link')).toHaveAttribute('href', '/admin/settings#ai')
  })

  it('a failed review with no stored code shows the generic copy', () => {
    render({ review: view({ status: 'failed', errorCode: null, summary: null, completedAt: null }) })

    expect(screen.getByRole('alert')).toHaveTextContent('The review failed. Try again.')
  })

  describe('a review that failed because it could not run', () => {
    const failedWith = (errorCode: string) => view({ status: 'failed', errorCode, summary: null, completedAt: null })
    const blockedBy = { LLM_DISABLED: { llmDisabled: true }, NOT_CONFIGURED: { judgeConfigured: false } } as const
    /** What blocks the section now, in the present tense. */
    const NOTICE = {
      LLM_DISABLED: 'AI features are turned off. Turn them on in AI settings',
      NOT_CONFIGURED: 'No conversation review model is set up. Set one up in AI settings, on the Conversation review tab',
    }
    /** What a failure says, in the past. */
    const FAILED = {
      LLM_DISABLED: 'AI features were off when this review ran. Turn them on in AI settings',
      NOT_CONFIGURED: 'No conversation review model was set up when this review ran. Set one up in AI settings, on the Conversation review tab',
      BUDGET_EXCEEDED: 'The Daily budget for conversation reviews is spent for today. Review again tomorrow. Raise it in Conversation review settings',
    }

    it.each(['LLM_DISABLED', 'NOT_CONFIGURED'] as const)('shows only the notice while %s still blocks the section', (code) => {
      render({ ...blockedBy[code], review: failedWith(code) })

      expect(screen.getByTestId('conversation-review-status')).toHaveTextContent('Failed')
      expect(screen.getByTestId('conversation-review-blocked')).toHaveTextContent(NOTICE[code])
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByTestId('conversation-review-section')).not.toHaveTextContent('when this review ran')
      expect(screen.getAllByRole('link').map((link) => link.dataset.testid)).toEqual(['conversation-review-blocked-link'])
    })

    it.each(['LLM_DISABLED', 'NOT_CONFIGURED'] as const)('shows only the past-tense copy, with its link, once %s no longer blocks it', (code) => {
      render({ review: failedWith(code) })

      expect(screen.getByRole('alert')).toHaveTextContent(FAILED[code])
      expect(within(screen.getByRole('alert')).getByTestId('conversation-review-failure-link')).toHaveAttribute('href', '/admin/settings#ai')
      expect(screen.queryByTestId('conversation-review-blocked')).not.toBeInTheDocument()
      expect(screen.getByTestId('conversation-review-button')).toBeEnabled()
    })

    it.each([
      ['LLM_DISABLED', 'NOT_CONFIGURED'],
      ['NOT_CONFIGURED', 'LLM_DISABLED'],
      ['LLM_DISABLED', 'BUDGET_EXCEEDED'],
    ] as const)('shows both while %s blocks a review that failed with %s, each link with its own test id', (blocking, code) => {
      render({ ...blockedBy[blocking], review: failedWith(code) })

      expect(screen.getByTestId('conversation-review-blocked')).toHaveTextContent(NOTICE[blocking])
      expect(screen.getByRole('alert')).toHaveTextContent(FAILED[code])
      expect(screen.getAllByRole('link').map((link) => link.dataset.testid)).toEqual(['conversation-review-blocked-link', 'conversation-review-failure-link'])
      expect(within(screen.getByRole('alert')).getByTestId('conversation-review-failure-link')).toBeInTheDocument()
    })
  })

  it('a review with no tool evidence shows conversation-review-no-tool-evidence', () => {
    const { unmount } = render({ review: view(), hasToolEvidence: false })
    expect(screen.getByTestId('conversation-review-no-tool-evidence')).toHaveTextContent('No tool evidence')
    unmount()

    render({ review: view(), hasToolEvidence: true })
    expect(screen.queryByTestId('conversation-review-no-tool-evidence')).not.toBeInTheDocument()
  })

  it('an unverified finding shows the "Unverified quote" badge (finding-unverified-<id>) after the verified and not_applicable ones', () => {
    const findings = [
      reviewFinding({ id: 'verified', evidenceCheck: 'verified' }),
      reviewFinding({ id: 'no-quote', evidenceCheck: 'not_applicable', type: 'misread_question', evidenceSource: 'none' }),
      reviewFinding({ id: 'unverified', evidenceCheck: 'unverified' }),
    ]
    render({ review: view(), findings })

    const cards = screen.getAllByTestId(/^finding-card-/).map((card) => card.dataset.testid)
    expect(cards).toEqual(['finding-card-verified', 'finding-card-no-quote', 'finding-card-unverified'])
    expect(screen.getByTestId('finding-unverified-unverified')).toHaveTextContent('Unverified quote')
    expect(screen.queryByTestId('finding-unverified-verified')).not.toBeInTheDocument()
    expect(screen.queryByTestId('finding-unverified-no-quote')).not.toBeInTheDocument()
  })
})

describe('ReviewSection polling', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('polls getConversationReviewStatus every 5 s while queued or running and stops at done or failed', async () => {
    const replies = [status('queued'), status('running'), status('running'), status('done')]
    getStatus.mockImplementation(async () => replies.shift() ?? status('done'))

    render({ review: view({ status: 'queued', summary: null, completedAt: null }) })
    await advance(4_999)
    expect(getStatus).not.toHaveBeenCalled()

    await advance(1)
    expect(getStatus).toHaveBeenCalledTimes(1)
    expect(getStatus).toHaveBeenCalledWith({ conversationId: 'chat-1' })
    await advance(5_000)
    await badgeReads('Reviewing')
    await advance(10_000)
    expect(getStatus).toHaveBeenCalledTimes(4)
    await badgeReads('Reviewed')

    await advance(60_000)
    expect(getStatus).toHaveBeenCalledTimes(4)
  })

  it('stops at a failed status and shows its copy', async () => {
    getStatus.mockResolvedValue(status('failed', 'STALE'))

    render({ review: view({ status: 'running', summary: null, completedAt: null }) })
    await advance(5_000)
    await advance(60_000)

    expect(getStatus).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('The review stopped responding')
  })

  it('a done review on mount makes no status call', async () => {
    render({ review: view() })
    await advance(60_000)

    expect(getStatus).not.toHaveBeenCalled()
  })

  it('starts polling after Review, without an immediate status call', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    review.mockResolvedValue({ success: true, data: { reviewId: 'review-2', status: 'queued' } })
    getStatus.mockResolvedValue({ success: true, data: { reviewId: 'review-2', status: 'running', errorCode: null } })

    render()
    await user.click(screen.getByTestId('conversation-review-button'))

    expect(review).toHaveBeenCalledWith({ conversationId: 'chat-1' })
    expect(screen.getByTestId('conversation-review-status')).toHaveTextContent('Queued')
    expect(getStatus).not.toHaveBeenCalled()
    await advance(5_000)
    expect(getStatus).toHaveBeenCalledTimes(1)
    await badgeReads('Reviewing')
  })

  it('shows the error toast when Review fails', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    review.mockResolvedValue({ success: false, code: 'CONFLICT', error: 'Only an open admin assistant conversation can be reviewed.' })

    render()
    await user.click(screen.getByTestId('conversation-review-button'))

    expect(mockShowError).toHaveBeenCalledWith('Only an open admin assistant conversation can be reviewed.')
    expect(screen.getByTestId('conversation-review-status')).toHaveTextContent('Not reviewed')
    await advance(60_000)
    expect(getStatus).not.toHaveBeenCalled()
  })

  it('a failed status call keeps the last known status and shows no stale data', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    review.mockResolvedValue({ success: true, data: { reviewId: 'review-2', status: 'queued' } })
    getStatus.mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Could not read the review status' })

    render({ review: view(), findings: [reviewFinding({ id: 'f1' })] })
    expect(screen.getByText('Two answers <b>miscounted</b> the libraries.')).toBeInTheDocument()
    await user.click(screen.getByTestId('conversation-review-button'))
    await advance(5_000)
    // Let the failed call settle, well before the next poll
    await advance(1_000)

    expect(getStatus).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('conversation-review-status')).toHaveTextContent('Queued')
    // The earlier review's summary, model and cost are not the queued review's
    expect(screen.queryByText('Two answers <b>miscounted</b> the libraries.')).not.toBeInTheDocument()
    expect(screen.getByTestId('conversation-review-section')).not.toHaveTextContent('gpt-5-mini')
    expect(screen.queryByText('Could not read the review status')).not.toBeInTheDocument()
    expect(screen.getByTestId('finding-card-f1')).toBeInTheDocument()

    // No retry and no further poll: the page says the check failed and offers one
    expect(screen.getByTestId('conversation-review-status-error')).toHaveTextContent('Could not check the review status.')
    await advance(60_000)
    expect(getStatus).toHaveBeenCalledTimes(1)

    getStatus.mockResolvedValue({ success: true, data: { reviewId: 'review-2', status: 'running', errorCode: null } })
    await user.click(screen.getByTestId('conversation-review-status-retry'))
    await badgeReads('Reviewing')
    expect(getStatus).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('conversation-review-status-error')).not.toBeInTheDocument()
    // Polling picks up again
    await advance(5_000)
    expect(getStatus).toHaveBeenCalledTimes(3)
  })

  it('a refreshed page with a different review than the cached one seeds the status from it and polls', async () => {
    getStatus.mockResolvedValue({ success: true, data: { reviewId: 'review-2', status: 'running', errorCode: null } })

    const { rerender } = render({ review: view() })
    expect(screen.getByTestId('conversation-review-status')).toHaveTextContent('Reviewed')

    // Another admin or the nightly sweep started review-2, and a refresh brought it
    rerender(
      <ReviewSection
        conversationId="chat-1"
        review={view({ id: 'review-2', status: 'queued', summary: null, completedAt: null })}
        findings={[]}
        hasToolEvidence
        judgeConfigured
        llmDisabled={false}
      />
    )
    await badgeReads('Queued')
    await advance(5_000)
    expect(getStatus).toHaveBeenCalledTimes(1)
    await badgeReads('Reviewing')
  })

  it('keeps focus on Review after it starts a review, and the button stays enabled', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    review.mockResolvedValue({ success: true, data: { reviewId: 'review-2', status: 'queued' } })

    render()
    const button = screen.getByTestId('conversation-review-button')
    await user.click(button)
    await badgeReads('Queued')
    // The start has settled: the button is no longer busy
    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'))

    expect(button).toBeEnabled()
    expect(document.activeElement).toBe(button)
  })

  it('announces the review\'s progress and its result in a status region', async () => {
    const replies = [status('running'), status('done')]
    getStatus.mockImplementation(async () => replies.shift() ?? status('done'))

    const { rerender } = render({ review: view({ status: 'queued', summary: null, completedAt: null }) })
    const region = screen.getByTestId('conversation-review-announcement')
    expect(region).toHaveAttribute('role', 'status')
    expect(region).toHaveTextContent('Review queued')

    await advance(5_000)
    await waitFor(() => expect(region).toHaveTextContent('Reviewing the conversation'))
    await advance(5_000)
    await badgeReads('Reviewed')

    // The poll's refresh brings the done review and its findings
    const findings = [reviewFinding({ id: 'f1' }), reviewFinding({ id: 'f2' }), reviewFinding({ id: 'f3' })]
    rerender(<ReviewSection conversationId="chat-1" review={view()} findings={findings} hasToolEvidence judgeConfigured llmDisabled={false} />)
    expect(region).toHaveTextContent('Review finished, 3 findings')
  })
})
