/**
 * The LLM provider form (P2.12): each provider shows its own fields, and each
 * model shows only the settings it supports, with its price and retirement.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { listLLMModels, updateWrappedLLMProvider } from '@/actions/admin'
import { LLMProviderForm } from '@/components/admin/settings/llm-provider-form'

jest.mock('@/actions/admin', () => ({
  listLLMModels: jest.fn(),
  updateChatLLMProvider: jest.fn(),
  updateWrappedLLMProvider: jest.fn(),
}))

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
  hasApiKey: true,
  baseUrl: null,
  effort: null,
  temperature: 0.8,
  maxTokens: 6000,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z'), advanceTimers: true })
  mockList.mockResolvedValue({ success: true, models: [], configuredProvider: null, configuredModel: null })
})

afterEach(() => jest.useRealTimers())

async function openForm(provider: typeof STORED | null = null) {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  render(<LLMProviderForm provider={provider} purpose="wrapped" />)
  await user.click(screen.getByTestId('llm-edit-wrapped'))
  // Opening a stored provider loads its model list first
  await waitFor(() => expect(screen.getByTestId('llm-provider-select')).toBeEnabled())
  return user
}

async function choose(user: ReturnType<typeof userEvent.setup>, select: string, value: string) {
  await user.click(screen.getByTestId(select))
  await user.click(screen.getByTestId(`${select}-option-${value}`))
}

describe('LLMProviderForm', () => {
  it('shows the read-only summary until Edit is pressed', () => {
    render(<LLMProviderForm provider={null} purpose="wrapped" />)
    expect(screen.getByText('No LLM provider configured')).toBeInTheDocument()
    expect(screen.queryByTestId('llm-provider-select')).not.toBeInTheDocument()
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
    await user.click(screen.getByTestId('llm-save'))

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
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('loads the stored provider models on edit and Test reports the list', async () => {
    mockList.mockResolvedValue({ success: true, models: ['gpt-4o', 'gpt-6-sol', 'ft:gpt-4o:me'], configuredProvider: 'openai', configuredModel: 'gpt-4o' })
    const user = await openForm(STORED)

    expect(mockList).toHaveBeenCalledWith({ purpose: 'wrapped', provider: 'openai', apiKey: undefined, baseUrl: undefined })
    expect(screen.getByTestId('llm-api-key-input')).toHaveAttribute('placeholder', 'Leave blank to keep the current key')
    expect(screen.getByTestId('llm-temperature-input')).toHaveValue(0.8)

    await user.click(screen.getByTestId('llm-model-select'))
    const options = within(screen.getByTestId('llm-model-select').parentElement as HTMLElement)
      .getAllByRole('button')
      .slice(1)
      .map((option) => option.getAttribute('data-testid'))
    // Known models first (catalogue order), then the rest of the provider's list, then the custom entry
    expect(options).toEqual([
      'llm-model-select-option-gpt-6-sol',
      'llm-model-select-option-gpt-4o',
      'llm-model-select-option-ft:gpt-4o:me',
      'llm-model-select-option-__custom__',
    ])
    await user.click(screen.getByTestId('llm-model-select-option-gpt-4o'))

    await user.click(screen.getByTestId('llm-test-connection'))
    expect(await screen.findByTestId('llm-test-result')).toHaveTextContent('Connected: 3 models available')
  })

  it('asks for the key again after the provider changes', async () => {
    const user = await openForm(STORED)

    await choose(user, 'llm-provider-select', 'google')

    expect(screen.getByTestId('llm-api-key-input')).toHaveAttribute('placeholder', 'Enter the API key')
    expect(screen.getByTestId('llm-api-key-input')).toBeRequired()
  })
})
