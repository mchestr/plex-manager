/**
 * The conversation page (P10.6): breadcrumbs, every time formatted on the
 * server in `Config.timezone` with its zone (GAP-43), the transcript through
 * MarkdownBody, the clean-up notice for a removed prompt (P0.20), and the
 * judge's Review section for a reviewable conversation, calls or none.
 */

import { render, screen, within } from '@testing-library/react'

import AIActivityConversationPage from '@/app/admin/ai/conversation/[conversationId]/page'
import { getConversationReview } from '@/lib/data/conversation-review'
import { getLLMUsageRecords } from '@/lib/data/llm-usage'

jest.mock('@/lib/admin', () => ({ assertAdmin: jest.fn() }))
jest.mock('@/lib/data/llm-usage', () => ({ getLLMUsageRecords: jest.fn() }))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormat: async () => (await import('@/lib/utils/format')).bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' }),
}))
jest.mock('@/lib/data/conversation-review', () => ({ getConversationReview: jest.fn() }))
jest.mock('@/components/admin/ai-activity/review/review-section', () => ({
  ReviewSection: ({ conversationId, findings, llmDisabled }: { conversationId: string; findings: unknown[]; llmDisabled: boolean }) => (
    <section data-testid="conversation-review-section">
      {conversationId}: {findings.length} findings{llmDisabled ? ', AI features off' : ''}
    </section>
  ),
}))
jest.mock('@/components/admin/ai-activity/expandable-prompt', () => ({
  ExpandablePrompt: ({ title, content }: { title: string; content: string }) => <section data-testid={`expandable-${title}`}>{content}</section>,
}))

const mockGetLLMUsageRecords = getLLMUsageRecords as jest.Mock
const mockGetConversationReview = jest.mocked(getConversationReview)

function reviewData(reviewable: boolean, llmDisabled = false) {
  return { review: null, findings: [], hasToolEvidence: true, judgeConfigured: true, llmDisabled, reviewable }
}

function call(id: string, createdAt: string, prompt: string | null) {
  return {
    id,
    userId: 'user-1',
    provider: 'openai',
    model: 'gpt-5-mini',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    cost: 0.01,
    createdAt: new Date(createdAt),
    prompt,
    response: prompt === null ? null : 'Hello!',
    user: { id: 'user-1', name: 'Mike', email: 'mike@example.com', image: null },
    wrapped: null,
    chatConversation: { id: 'chat-1', createdAt: new Date('2026-10-12T19:00:00Z') },
  }
}

async function renderPage() {
  const ui = await AIActivityConversationPage({ params: Promise.resolve({ conversationId: 'chat-1' }) })
  return render(<>{ui}</>)
}

describe('Admin AI activity conversation page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetConversationReview.mockResolvedValue(reviewData(false))
  })

  it('has breadcrumbs back to AI activity and the member', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({ records: [call('call-1', '2026-10-12T19:26:00Z', null)] })
    await renderPage()

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(crumbs).toHaveTextContent('AI activity/Mike/Conversation')
    expect(within(crumbs).getByRole('link', { name: 'Mike' })).toHaveAttribute('href', '/admin/ai?userId=user-1')
  })

  it('formats the summary and every row in the server zone with its name', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({
      records: [call('call-oct', '2026-10-12T19:26:00Z', null), call('call-jan', '2027-01-12T20:26:00Z', null)],
    })
    await renderPage()

    expect(screen.getByTestId('admin-ai-conversation-range')).toHaveTextContent('Oct 12, 2026, 2:26 PM CDT to Jan 12, 2027, 2:26 PM CST')
    expect(screen.getByTestId('conversation-usage-time-call-oct')).toHaveTextContent('Oct 12, 2026, 2:26 PM CDT')
    expect(screen.getByTestId('conversation-usage-time-call-jan')).toHaveTextContent('Jan 12, 2027, 2:26 PM CST')
  })

  it('shows the clean-up notice when the latest prompt was removed, and links each call', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({
      records: [call('call-2', '2026-10-12T19:28:00Z', null), call('call-1', '2026-10-12T19:26:00Z', null)],
    })
    await renderPage()

    expect(screen.getByTestId('llm-text-removed-notice')).toHaveTextContent("For privacy, this text isn't kept.")
    expect(screen.getByRole('link', { name: /^Call 1,/ })).toHaveAttribute('href', '/admin/ai/call-2')
    expect(screen.queryByText('User:')).not.toBeInTheDocument()
  })

  it('renders the latest prompt as a Markdown transcript, with tool JSON as code', async () => {
    const prompt = JSON.stringify([
      { role: 'user', content: 'What should I **watch**?' },
      { role: 'tool', name: 'search', content: '{"results":[1]}' },
    ])
    mockGetLLMUsageRecords.mockResolvedValue({ records: [call('call-1', '2026-10-12T19:26:00Z', prompt)] })
    await renderPage()

    const transcript = screen.getByTestId('conversation-transcript')
    expect(within(transcript).getByText('watch').tagName).toBe('STRONG')
    expect(transcript).toHaveTextContent('Tool (search)')
    expect(within(transcript).getByText(/"results"/).tagName).toBe('PRE')
    expect(screen.getByText('What should I **watch**?')).toBeInTheDocument()
  })

  it('shows the review section above the transcript for a reviewable conversation', async () => {
    mockGetConversationReview.mockResolvedValue(reviewData(true))
    mockGetLLMUsageRecords.mockResolvedValue({ records: [call('call-1', '2026-10-12T19:26:00Z', 'plain text prompt')] })
    await renderPage()

    expect(mockGetConversationReview).toHaveBeenCalledWith('chat-1')
    const section = screen.getByTestId('conversation-review-section')
    expect(section).toHaveTextContent('chat-1: 0 findings')
    expect(section.compareDocumentPosition(screen.getByTestId('expandable-Latest prompt')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the review section renders when the conversation has no LLM calls', async () => {
    mockGetConversationReview.mockResolvedValue(reviewData(true))
    mockGetLLMUsageRecords.mockResolvedValue({ records: [] })
    await renderPage()

    expect(screen.getByText('No calls')).toBeInTheDocument()
    expect(screen.getByTestId('conversation-review-section')).toHaveTextContent('chat-1: 0 findings')
  })

  it('tells the review section when AI features are off', async () => {
    mockGetConversationReview.mockResolvedValue(reviewData(true, true))
    mockGetLLMUsageRecords.mockResolvedValue({ records: [] })
    await renderPage()

    expect(screen.getByTestId('conversation-review-section')).toHaveTextContent('chat-1: 0 findings, AI features off')
  })

  it('leaves the review section out of a conversation that cannot be reviewed', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({ records: [call('call-1', '2026-10-12T19:26:00Z', null)] })
    const { unmount } = await renderPage()
    expect(screen.queryByTestId('conversation-review-section')).not.toBeInTheDocument()
    unmount()

    mockGetLLMUsageRecords.mockResolvedValue({ records: [] })
    await renderPage()
    expect(screen.queryByTestId('conversation-review-section')).not.toBeInTheDocument()
  })

  it('falls back to the raw prompt when it is not chat messages', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({ records: [call('call-1', '2026-10-12T19:26:00Z', 'plain text prompt')] })
    await renderPage()

    expect(screen.getByTestId('expandable-Latest prompt')).toHaveTextContent('plain text prompt')
  })
})
