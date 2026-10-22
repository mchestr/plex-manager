/**
 * The conversation page (P10.6): breadcrumbs, every time formatted on the
 * server in `Config.timezone` with its zone (GAP-43), the transcript through
 * MarkdownBody, and the clean-up notice for a removed prompt (P0.20).
 */

import { render, screen, within } from '@testing-library/react'

import LLMConversationPage from '@/app/admin/llm-usage/conversation/[conversationId]/page'
import { getLLMUsageRecords } from '@/lib/data/llm-usage'

jest.mock('@/lib/data/llm-usage', () => ({ getLLMUsageRecords: jest.fn() }))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormat: async () => (await import('@/lib/utils/format')).bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' }),
}))
jest.mock('@/components/admin/prompts/expandable-prompt', () => ({
  ExpandablePrompt: ({ title, content }: { title: string; content: string }) => <section data-testid={`expandable-${title}`}>{content}</section>,
}))

const mockGetLLMUsageRecords = getLLMUsageRecords as jest.Mock

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
  const ui = await LLMConversationPage({ params: Promise.resolve({ conversationId: 'chat-1' }) })
  return render(<>{ui}</>)
}

describe('Admin conversation LLM usage page', () => {
  beforeEach(() => jest.clearAllMocks())

  it('has breadcrumbs back to LLM usage and the member', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({ records: [call('call-1', '2026-10-12T19:26:00Z', null)] })
    await renderPage()

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(crumbs).toHaveTextContent('LLM usage/Mike/Conversation')
    expect(within(crumbs).getByRole('link', { name: 'Mike' })).toHaveAttribute('href', '/admin/llm-usage?userId=user-1')
  })

  it('formats the summary and every row in the server zone with its name', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({
      records: [call('call-oct', '2026-10-12T19:26:00Z', null), call('call-jan', '2027-01-12T20:26:00Z', null)],
    })
    await renderPage()

    expect(screen.getByTestId('admin-llm-conversation-range')).toHaveTextContent('Oct 12, 2026, 2:26 PM CDT to Jan 12, 2027, 2:26 PM CST')
    expect(screen.getByTestId('conversation-usage-time-call-oct')).toHaveTextContent('Oct 12, 2026, 2:26 PM CDT')
    expect(screen.getByTestId('conversation-usage-time-call-jan')).toHaveTextContent('Jan 12, 2027, 2:26 PM CST')
  })

  it('shows the clean-up notice when the latest prompt was removed, and links each call', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({
      records: [call('call-2', '2026-10-12T19:28:00Z', null), call('call-1', '2026-10-12T19:26:00Z', null)],
    })
    await renderPage()

    expect(screen.getByTestId('llm-text-removed-notice')).toHaveTextContent('Text removed in the October 2026 privacy clean-up')
    expect(screen.getByRole('link', { name: /^Call 1,/ })).toHaveAttribute('href', '/admin/llm-usage/call-2')
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

  it('falls back to the raw prompt when it is not chat messages', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({ records: [call('call-1', '2026-10-12T19:26:00Z', 'plain text prompt')] })
    await renderPage()

    expect(screen.getByTestId('expandable-Latest Conversation Prompt')).toHaveTextContent('plain text prompt')
  })
})
