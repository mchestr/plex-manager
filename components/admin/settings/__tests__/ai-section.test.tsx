/**
 * The AI section's third purpose: a Conversation review tab whose only part
 * is the judge's provider form, saved through its own action. The judge's
 * spend cap is edited in the Conversation review section, not here. The
 * Rewind generation tab points to the Rewind settings tab for the rest.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { listLLMModels, updateChatLLMProvider, updateJudgeLLMProvider, updateWrappedLLMProvider } from '@/actions/admin/admin-llm-providers'
import { AiSection } from '@/components/admin/settings/sections/ai-section'
import type { StoredLLMProvider } from '@/hooks/use-llm-provider-form'

jest.mock('@/actions/admin/admin-llm-providers', () => ({
  listLLMModels: jest.fn(),
  updateChatLLMProvider: jest.fn(),
  updateWrappedLLMProvider: jest.fn(),
  updateJudgeLLMProvider: jest.fn(),
}))
jest.mock('@/actions/admin/admin-config', () => ({ setLLMDisabled: jest.fn(), updateLlmCaps: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const HEALTH = { status: 'ok' as const, code: null, checkedAt: null }
const CAPS = { perUserUsd: 1, adminUsd: 5, serverUsd: 20 }

const JUDGE: StoredLLMProvider = {
  provider: 'openai',
  model: 'gpt-4o',
  secret: { last4: '9876', origin: 'https://api.openai.com' },
  baseUrl: null,
  effort: null,
  temperature: null,
  maxTokens: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listLLMModels).mockResolvedValue({ success: true, data: { models: [], configuredProvider: null, configuredModel: null } })
})

function renderSection(judge: StoredLLMProvider | null = null) {
  return render(<AiSection chat={null} wrapped={null} judge={judge} llmDisabled={false} caps={CAPS} health={HEALTH} />)
}

async function choose(user: ReturnType<typeof userEvent.setup>, select: string, value: string) {
  await user.click(screen.getByTestId(select))
  const option = await screen.findByTestId(`${select}-option-${value}`)
  // The popup ignores the pointer until it is positioned.
  await waitFor(() => expect(option.closest('[style*="pointer-events: none"]')).toBeNull())
  await user.click(option)
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

describe('AI section, Conversation review tab', () => {
  it('judge tab saves a provider with purpose judge through updateJudgeLLMProvider and toasts "Conversation review model saved"', async () => {
    jest.mocked(updateJudgeLLMProvider).mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('tab', { name: 'Conversation review' }))
    expect(screen.getByTestId('settings-ai-summary-judge-empty')).toHaveTextContent('Not set up.')
    await user.click(screen.getByTestId('settings-ai-edit'))
    await waitFor(() => expect(screen.getByTestId('llm-provider-select')).toBeEnabled())

    await choose(user, 'llm-provider-select', 'anthropic')
    await choose(user, 'llm-model-select', 'claude-sonnet-5-5')
    await user.type(screen.getByTestId('llm-api-key-input'), 'ant-judge-key')
    await user.click(screen.getByTestId('settings-ai-save'))

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Conversation review model saved'))
    expect(updateJudgeLLMProvider).toHaveBeenCalledWith({
      provider: 'anthropic',
      apiKey: 'ant-judge-key',
      baseUrl: undefined,
      model: 'claude-sonnet-5-5',
      customModel: false,
      effort: undefined,
      temperature: undefined,
      maxTokens: undefined,
    })
    expect(updateChatLLMProvider).not.toHaveBeenCalled()
    expect(updateWrappedLLMProvider).not.toHaveBeenCalled()

    // Test connection on the judge tab lists the judge purpose's models
    await user.click(screen.getByTestId('settings-ai-test'))
    await waitFor(() => expect(listLLMModels).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'judge' })))
  })

  it('the judge tab holds only the provider form', async () => {
    const user = userEvent.setup()
    renderSection(JUDGE)

    await user.click(screen.getByRole('tab', { name: 'Conversation review' }))
    expect(screen.getByTestId('settings-ai-summary-judge-provider')).toHaveTextContent('OpenAI')
    // The Admin assistant's panel, with its caps, leaves once its exit settles
    await waitFor(() => expect(screen.queryByTestId('settings-ai-summary-caps')).not.toBeInTheDocument())

    await user.click(screen.getByTestId('settings-ai-edit'))
    await waitFor(() => expect(screen.getByTestId('llm-provider-select')).toBeEnabled())

    const panel = screen.getByRole('tabpanel')
    expect(panel).toContainElement(screen.getByTestId('llm-provider-form-judge'))
    expect(screen.queryByTestId('llm-spend-caps-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('llm-provider-form-chat')).not.toBeInTheDocument()
    expect(screen.queryByTestId('llm-provider-form-wrapped')).not.toBeInTheDocument()
    expect(panel).not.toHaveTextContent('Set the LLM mode and season budget on the Rewind settings tab.')
  })

  it('selecting settings-ai-tab-judge shows the judge provider form', async () => {
    const user = userEvent.setup()
    renderSection(JUDGE)

    await user.click(screen.getByTestId('settings-ai-edit'))
    expect(screen.getByTestId('llm-provider-form-chat')).toBeInTheDocument()

    await user.click(screen.getByTestId('settings-ai-tab-judge'))

    expect(await screen.findByTestId('llm-provider-form-judge')).toBeInTheDocument()
    expect(screen.getByTestId('settings-ai-tab-judge')).toHaveAttribute('aria-selected', 'true')
    // The Admin assistant's panel leaves once its exit settles
    await waitFor(() => expect(screen.queryByTestId('llm-provider-form-chat')).not.toBeInTheDocument())
  })
})

describe('AI section, Rewind generation tab', () => {
  it('points to the Rewind settings tab for the LLM mode and season budget', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('tab', { name: 'Rewind generation' }))

    expect(await screen.findByRole('tabpanel')).toHaveTextContent('Set the LLM mode and season budget on the Rewind settings tab.')
  })
})
