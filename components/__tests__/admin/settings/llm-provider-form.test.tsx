/**
 * The LLM provider form (P2.12): each provider shows its own fields, and each
 * model shows only the settings it supports, with its price and retirement.
 * Since P10.19 it is always open inside the AI section, one tab per purpose.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { listLLMModels, updateWrappedLLMProvider } from '@/actions/admin/admin-llm-providers'
import { AiSection } from '@/components/admin/settings/sections/ai-section'

jest.mock('@/actions/admin/admin-llm-providers', () => ({ listLLMModels: jest.fn(), updateChatLLMProvider: jest.fn(), updateWrappedLLMProvider: jest.fn() }))
jest.mock('@/actions/admin/admin-config', () => ({ setLLMDisabled: jest.fn(), updateLlmCaps: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: jest.fn(), showError: mockShowError }),
}))

const mockList = listLLMModels as jest.Mock
const mockSave = updateWrappedLLMProvider as jest.Mock

const STORED = {
  provider: 'openai',
  model: 'gpt-4o',
  secret: { last4: '', origin: 'https://api.openai.com' },
  baseUrl: null,
  effort: null,
  temperature: 0.8,
  maxTokens: 6000,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z'), advanceTimers: true })
  mockList.mockResolvedValue({ success: true, data: { models: [], configuredProvider: null, configuredModel: null } })
})

afterEach(() => jest.useRealTimers())

const HEALTH = { status: 'ok' as const, code: null, checkedAt: null }
const CAPS = { perUserUsd: 1, adminUsd: 5, serverUsd: 20 }

function renderSection(provider: typeof STORED | null = null) {
  return render(<AiSection chat={null} wrapped={provider} llmDisabled={false} caps={CAPS} health={HEALTH} />)
}

async function openForm(provider: typeof STORED | null = null) {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  renderSection(provider)
  await user.click(screen.getByRole('tab', { name: 'Rewind generation' }))
  await waitFor(() => expect(screen.queryByTestId('llm-provider-form-chat')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByTestId('llm-provider-select')).toBeEnabled())
  return user
}

async function choose(user: ReturnType<typeof userEvent.setup>, select: string, value: string) {
  await user.click(screen.getByTestId(select))
  const option = await screen.findByTestId(`${select}-option-${value}`)
  // The popup ignores the pointer until it is positioned.
  await waitFor(() => expect(option.closest('[style*="pointer-events: none"]')).toBeNull())
  await user.click(option)
  // The Select is modal while open; wait for it to close before the next click.
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

describe('LLMProviderForm', () => {
  it('is always open, with Save disabled until a field changes (UI-31)', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    renderSection(STORED)

    expect(screen.getByTestId('llm-provider-form-chat')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-ai-save')).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: 'Rewind generation' }))
    await waitFor(() => expect(screen.queryByTestId('llm-provider-form-chat')).not.toBeInTheDocument())
    await user.clear(screen.getByTestId('llm-max-tokens-input'))
    await user.type(screen.getByTestId('llm-max-tokens-input'), '7000')
    expect(screen.getByTestId('settings-ai-save')).toBeEnabled()
    expect(screen.getByTestId('settings-ai-unsaved')).toBeInTheDocument()

    await user.click(screen.getByTestId('settings-ai-discard'))
    expect(screen.getByTestId('llm-max-tokens-input')).toHaveValue(6000)
  })

  it('changes the fields when the provider changes, and a preset fills the base URL', async () => {
    const user = await openForm()
    expect(screen.queryByTestId('llm-base-url-input')).not.toBeInTheDocument()

    await choose(user, 'llm-provider-select', 'openai-compatible')

    expect(screen.getByTestId('llm-base-url-input')).toHaveValue('')
    expect(screen.getByTestId('llm-api-key-input')).not.toBeRequired()
    await user.click(screen.getByTestId('llm-base-url-preset-ollama'))
    expect(screen.getByTestId('llm-base-url-input')).toHaveValue('http://localhost:11434/v1')

    await choose(user, 'llm-provider-select', 'anthropic')
    expect(screen.queryByTestId('llm-base-url-input')).not.toBeInTheDocument()
    expect(screen.getByTestId('llm-api-key-input')).toBeRequired()
  })

  it('shows effort and hides temperature for claude-sonnet-5-5, and the reverse for gpt-4o', async () => {
    const user = await openForm()

    await choose(user, 'llm-model-select', 'gpt-4o')
    expect(screen.getByTestId('llm-temperature-input')).toHaveValue(null)
    expect(screen.queryByTestId('llm-effort-select')).not.toBeInTheDocument()
    expect(screen.getByTestId('llm-model-price')).toHaveTextContent('$2.50 / $10 per 1M tokens, as of Oct 17, 2026')

    await choose(user, 'llm-provider-select', 'anthropic')
    await choose(user, 'llm-model-select', 'claude-sonnet-5-5')
    expect(screen.queryByTestId('llm-temperature-input')).not.toBeInTheDocument()
    expect(screen.getByTestId('llm-effort-select')).toBeInTheDocument()
    expect(screen.getByTestId('llm-model-price')).toHaveTextContent('$2 / $10 per 1M tokens, as of Oct 17, 2026')
    expect(screen.queryByTestId('llm-model-retires')).not.toBeInTheDocument()
  })

  it('shows a retirement badge within 60 days of retirement', async () => {
    const user = await openForm()

    await choose(user, 'llm-model-select', 'gpt-4.1-nano')

    expect(screen.getByTestId('llm-model-retires')).toHaveTextContent('Retires on Oct 23, 2026')
  })

  it('takes a custom model id, priced as unknown', async () => {
    const user = await openForm()

    await choose(user, 'llm-model-select', '__custom__')
    await user.type(screen.getByTestId('llm-model-custom-input'), 'gpt-9-preview')

    expect(screen.getByTestId('llm-model-price')).toHaveTextContent('Price unknown')
  })

  it('saves only the settings the model supports, with no injected temperature', async () => {
    mockSave.mockResolvedValue({ success: true })
    const user = await openForm()

    await choose(user, 'llm-provider-select', 'anthropic')
    await choose(user, 'llm-model-select', 'claude-sonnet-5-5')
    await choose(user, 'llm-effort-select', 'low')
    await user.type(screen.getByTestId('llm-api-key-input'), 'ant-key')
    await user.click(screen.getByTestId('settings-ai-save'))

    expect(mockSave).toHaveBeenCalledWith({
      provider: 'anthropic',
      apiKey: 'ant-key',
      baseUrl: undefined,
      model: 'claude-sonnet-5-5',
      customModel: false,
      effort: 'low',
      temperature: undefined,
      maxTokens: undefined,
    })
    // The action revalidates /admin/settings, so no client refresh follows (P10.7)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('asks the provider for nothing on open, and Test loads its list into the picker', async () => {
    mockList.mockResolvedValue({ success: true, data: { models: ['gpt-4o', 'gpt-6-sol', 'ft:gpt-4o:me'], configuredProvider: 'openai', configuredModel: 'gpt-4o' } })
    const user = await openForm(STORED)

    // P10.7: the picker starts from the static catalogue
    expect(mockList).not.toHaveBeenCalled()
    // P10.20: the saved key is a masked placeholder, never a value
    expect(screen.getByTestId('llm-api-key-input')).toHaveAttribute('placeholder', '••••••••••••')
    expect(screen.getByTestId('llm-api-key-input')).toHaveValue('')
    expect(screen.getByTestId('llm-temperature-input')).toHaveValue(0.8)

    await user.click(screen.getByTestId('settings-ai-test'))
    await waitFor(() => expect(screen.getByTestId('settings-ai-test-result')).toHaveTextContent('Connected: 3 models available'))
    expect(mockList).toHaveBeenCalledWith({ purpose: 'wrapped', provider: 'openai', apiKey: undefined, baseUrl: undefined })

    await user.click(screen.getByTestId('llm-model-select'))
    const options = within(await screen.findByRole('listbox'))
      .getAllByRole('option')
      .map((option) => option.getAttribute('data-testid'))
    // Known models first (catalogue order), then the rest of the provider's list, then the custom entry
    expect(options).toEqual([
      'llm-model-select-option-gpt-6-sol',
      'llm-model-select-option-gpt-4o',
      'llm-model-select-option-ft:gpt-4o:me',
      'llm-model-select-option-__custom__',
    ])
  })

  it('asks for the key again after the provider changes', async () => {
    const user = await openForm(STORED)

    await choose(user, 'llm-provider-select', 'google')

    // The saved key only goes to the old provider (SEC-31): re-enter, and Save waits for it
    expect(screen.getByTestId('llm-api-key-input')).toHaveAttribute('data-state', 'reenter-required')
    expect(screen.getByTestId('llm-api-key-input')).toBeRequired()
    expect(screen.getByTestId('settings-ai-save')).toBeDisabled()
    expect(screen.getByTestId('settings-ai-unsaved')).toHaveTextContent('Enter the API key to test or save')
  })
})
