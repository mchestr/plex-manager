/**
 * The prompt column is nullable since the October 2026 privacy clean-up
 * (P0.20). It strips only non-chat rows, but the conversation page and its
 * rows must still handle a null prompt.
 */

import { render, screen } from '@testing-library/react'

import LLMConversationPage from '@/app/admin/llm-usage/conversation/[conversationId]/page'
import { getLLMUsageRecords } from '@/actions/admin'

jest.mock('@/actions/admin', () => ({
  getLLMUsageRecords: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/components/admin/prompts/expandable-prompt', () => ({
  ExpandablePrompt: ({ title, content }: { title: string; content: string }) => (
    <section data-testid={`expandable-${title}`}>{content}</section>
  ),
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
    chatConversation: { id: 'chat-1', createdAt: new Date('2025-12-01T10:00:00Z') },
  }
}

async function renderPage() {
  const ui = await LLMConversationPage({ params: Promise.resolve({ conversationId: 'chat-1' }) })
  return render(<>{ui}</>)
}

describe('Admin conversation LLM usage page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the clean-up notice when the latest prompt was removed, and rows without a snippet', async () => {
    mockGetLLMUsageRecords.mockResolvedValue({
      records: [call('call-2', '2025-12-01T10:02:00Z', null), call('call-1', '2025-12-01T10:01:00Z', null)],
    })

    await renderPage()

    expect(screen.getByTestId('llm-text-removed-notice')).toHaveTextContent('Latest Conversation Prompt')
    expect(screen.getByTestId('llm-text-removed-notice')).toHaveTextContent(
      'Text removed in the October 2026 privacy clean-up'
    )
    expect(screen.queryByTestId('expandable-Latest Conversation Prompt')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'View Request →' })).toHaveLength(2)
    expect(screen.queryByText('User:')).not.toBeInTheDocument()
  })

  it('shows the latest prompt and each call\'s last user message when they have text', async () => {
    const prompt = JSON.stringify([{ role: 'user', content: 'What should I watch?' }])
    mockGetLLMUsageRecords.mockResolvedValue({ records: [call('call-1', '2025-12-01T10:01:00Z', prompt)] })

    await renderPage()

    expect(screen.getByTestId('expandable-Latest Conversation Prompt')).toHaveTextContent('[USER]')
    expect(screen.getByText('What should I watch?')).toBeInTheDocument()
    expect(screen.queryByTestId('llm-text-removed-notice')).not.toBeInTheDocument()
  })
})
