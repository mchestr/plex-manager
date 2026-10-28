/**
 * The LLM request page shows the clean-up notice for a prompt or response
 * that the October 2026 privacy clean-up removed (P0.20).
 */

import { render, screen } from '@testing-library/react'

import LLMUsageDetailPage from '@/app/admin/llm-usage/[usageId]/page'
import { getLLMUsageById } from '@/lib/data/llm-usage'

jest.mock('@/lib/admin', () => ({ assertAdmin: jest.fn() }))
jest.mock('@/lib/data/llm-usage', () => ({ getLLMUsageById: jest.fn() }))

jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
}))

jest.mock('@/components/admin/llm-usage/expandable-prompt', () => ({
  ExpandablePrompt: ({ title, content }: { title: string; content: string }) => (
    <section data-testid={`expandable-${title}`}>{content}</section>
  ),
}))

const mockGetLLMUsageById = getLLMUsageById as jest.Mock

function usageRecord(text: { prompt: string | null; response: string | null }) {
  return {
    id: 'usage-1',
    userId: 'user-1',
    provider: 'openai',
    model: 'gpt-5-mini',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    cost: 0.01,
    createdAt: new Date('2025-12-01T00:00:00Z'),
    user: { id: 'user-1', name: 'Mike', email: 'mike@example.com', image: null },
    wrapped: { id: 'wrapped-1', year: 2025, status: 'completed', generatedAt: null },
    chatConversation: null,
    ...text,
  }
}

async function renderPage() {
  const ui = await LLMUsageDetailPage({ params: Promise.resolve({ usageId: 'usage-1' }) })
  return render(<>{ui}</>)
}

describe('Admin LLM request page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the clean-up notice for a removed prompt and response', async () => {
    mockGetLLMUsageById.mockResolvedValue(usageRecord({ prompt: null, response: null }))

    await renderPage()

    const notices = screen.getAllByTestId('llm-text-removed-notice')
    expect(notices).toHaveLength(2)
    expect(notices[0]).toHaveTextContent('Prompt')
    expect(notices[1]).toHaveTextContent('Response')
    notices.forEach((notice) =>
      expect(notice).toHaveTextContent('The October 2026 privacy clean-up removed this text.')
    )
    expect(screen.queryByTestId('expandable-Prompt')).not.toBeInTheDocument()
    expect(screen.queryByTestId('expandable-Response')).not.toBeInTheDocument()
  })

  it('shows the prompt and the formatted response when they have text', async () => {
    mockGetLLMUsageById.mockResolvedValue(usageRecord({ prompt: 'Write a recap', response: '{"summary":"ok"}' }))

    await renderPage()

    expect(screen.getByTestId('expandable-Prompt')).toHaveTextContent('Write a recap')
    expect(screen.getByTestId('expandable-Response').textContent).toBe(JSON.stringify({ summary: 'ok' }, null, 2))
    expect(screen.queryByTestId('llm-text-removed-notice')).not.toBeInTheDocument()
  })
})
