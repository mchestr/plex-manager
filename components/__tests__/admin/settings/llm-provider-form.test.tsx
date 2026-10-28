/**
 * The LLM provider form (P2.12): each provider shows its own fields, and each
 * model shows only the settings it supports, with its price and retirement.
 * The AI section opens read-only, one tab per purpose: each tab shows its
 * saved provider until Edit, which opens the same tab's fields.
 */

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { listLLMModels, updateWrappedLLMProvider } from '@/actions/admin/admin-llm-providers'
import { AiSection } from '@/components/admin/settings/sections/ai-section'
import type { StoredLLMProvider } from '@/hooks/use-llm-provider-form'

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

const mockList = jest.mocked(listLLMModels)
const mockSave = jest.mocked(updateWrappedLLMProvider)

const STORED: StoredLLMProvider = {
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

function renderSection(wrapped: StoredLLMProvider | null = null, chat: StoredLLMProvider | null = null) {
  return render(<AiSection chat={chat} wrapped={wrapped} llmDisabled={false} caps={CAPS} health={HEALTH} />)
}

function setup() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
}

/** Lets a save, and the section's answer to it, finish. */
const settle = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(0)
  })

/** The Rewind generation tab, then Edit: that tab's fields. */
async function openForm(provider: StoredLLMProvider | null = null) {
  const user = setup()
  renderSection(provider)
  await user.click(screen.getByRole('tab', { name: 'Rewind generation' }))
  await user.click(screen.getByTestId('settings-ai-edit'))
  await waitFor(() => expect(screen.getByTestId('llm-provider-select')).toBeEnabled())
  expect(screen.queryByTestId('llm-provider-form-chat')).not.toBeInTheDocument()
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

describe('AI section, view mode', () => {
  it('opens read-only on the Admin assistant tab, with the AI switch live outside any form', () => {
    renderSection(STORED)

    expect(screen.getByTestId('settings-ai-summary')).toBeInTheDocument()
    expect(screen.getByTestId('settings-ai-tab-chat')).toHaveAttribute('aria-selected', 'true')
    // Nothing stored for the assistant: the form would default to OpenAI, the summary does not
    expect(screen.getByTestId('settings-ai-summary-chat-empty')).toHaveTextContent('Not set up.')
    expect(screen.getByTestId('settings-ai-summary-caps-user')).toHaveTextContent('$1.00 a day')
    expect(screen.getByRole('button', { name: 'Edit AI provider' })).toHaveAttribute('data-testid', 'settings-ai-edit')
    expect(screen.queryByTestId('llm-provider-form-chat')).not.toBeInTheDocument()
    expect(screen.queryByTestId('llm-provider-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-ai-save')).not.toBeInTheDocument()

    const toggle = screen.getByRole('switch', { name: 'AI features' })
    expect(toggle).toHaveAttribute('data-testid', 'settings-ai-features')
    expect(toggle).toHaveAccessibleDescription(/This saves at once\.$/)
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('shows the saved provider on its tab, with only the settings its model takes', async () => {
    const user = setup()
    renderSection(STORED)

    await user.click(screen.getByRole('tab', { name: 'Rewind generation' }))

    const row = (key: string) => screen.getByTestId(`settings-ai-summary-wrapped-${key}`)
    expect(row('provider')).toHaveTextContent('OpenAI')
    expect(row('model')).toHaveTextContent('GPT-4o')
    expect(row('model-price')).toHaveTextContent('$2.50 / $10 per 1M tokens, as of Oct 17, 2026')
    expect(row('api-key')).toHaveTextContent('Saved')
    expect(row('temperature')).toHaveTextContent('0.8')
    expect(row('max-tokens')).toHaveTextContent('6,000')
    // gpt-4o takes no effort, and only a local server has a base URL
    expect(screen.queryByTestId('settings-ai-summary-wrapped-effort')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-ai-summary-wrapped-base-url')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-ai-summary-wrapped-model-retires')).not.toBeInTheDocument()
  })

  it('shows effort but no temperature for Claude, defaults for blanks, and the key by its last four only', () => {
    renderSection(null, {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      secret: { last4: '1234', origin: 'https://api.anthropic.com' },
      baseUrl: null,
      effort: null,
      temperature: null,
      maxTokens: null,
    })

    const row = (key: string) => screen.getByTestId(`settings-ai-summary-chat-${key}`)
    expect(row('provider')).toHaveTextContent('Anthropic')
    expect(row('model')).toHaveTextContent('Claude Sonnet 5.5')
    expect(row('effort')).toHaveTextContent('Model default')
    expect(screen.queryByTestId('settings-ai-summary-chat-temperature')).not.toBeInTheDocument()
    expect(row('max-tokens')).toHaveTextContent('Default')
    expect(row('api-key')).toHaveTextContent('Saved, ends in 1234')
    expect(screen.getByTestId('settings-ai-summary-chat')).toBeInTheDocument()
  })

  it('reads a local server: its base URL, a custom model as saved, and no key as none', async () => {
    const user = setup()
    renderSection({ provider: 'openai-compatible', model: 'qwen3.6:27b', secret: null, baseUrl: 'http://localhost:11434/v1', effort: null, temperature: null, maxTokens: 2000 })

    await user.click(screen.getByRole('tab', { name: 'Rewind generation' }))

    const row = (key: string) => screen.getByTestId(`settings-ai-summary-wrapped-${key}`)
    expect(row('provider')).toHaveTextContent('OpenAI-compatible server')
    expect(row('base-url')).toHaveTextContent('http://localhost:11434/v1')
    expect(row('model')).toHaveTextContent('qwen3.6:27b (custom)')
    expect(row('model-price')).toHaveTextContent('Price unknown')
    expect(row('api-key')).toHaveTextContent('None (local server)')
  })

  it('shows a provider this version does not know, and its model, as saved', () => {
    renderSection(null, { ...STORED, provider: 'mistral', model: 'mistral-large' })

    expect(screen.getByTestId('settings-ai-summary-chat-provider')).toHaveTextContent('mistral')
    expect(screen.getByTestId('settings-ai-summary-chat-model')).toHaveTextContent('mistral-large')
  })

  it('keeps the retirement warning in view mode', async () => {
    const user = setup()
    renderSection({ ...STORED, model: 'gpt-4.1-nano' })

    await user.click(screen.getByRole('tab', { name: 'Rewind generation' }))

    expect(screen.getByTestId('settings-ai-summary-wrapped-model-retires')).toHaveTextContent('Retires on Oct 23, 2026')
  })

  it('flags a key that cannot be read, blocks Test, and Enter it again opens the key field', async () => {
    const user = setup()
    renderSection(null, { ...STORED, secret: { last4: '', origin: 'https://api.openai.com', unreadable: true } })

    expect(screen.getByTestId('settings-ai-summary-chat-api-key')).toHaveTextContent("Can't be read with the current encryption key.")
    expect(screen.getByTestId('settings-ai-summary-chat-api-key')).not.toHaveTextContent('Saved')
    expect(screen.getByTestId('settings-ai-test')).toBeDisabled()
    expect(screen.getByTestId('settings-ai-blocked')).toHaveTextContent('Enter the API key to test or save')

    await user.click(screen.getByTestId('settings-ai-summary-chat-api-key-reenter'))

    await waitFor(() => expect(screen.getByTestId('llm-api-key-input')).toHaveFocus())
    expect(screen.getByTestId('llm-api-key-input')).toHaveAttribute('data-state', 'reenter-required')
    expect(screen.getByTestId('settings-ai-tab-chat')).toHaveAttribute('aria-selected', 'true')
  })

  it('tests the open tab with its saved values, and the list it loads feeds the picker after Edit', async () => {
    mockList.mockResolvedValue({ success: true, data: { models: ['gpt-4o', 'gpt-6-sol', 'ft:gpt-4o:me'], configuredProvider: 'openai', configuredModel: 'gpt-4o' } })
    const user = setup()
    renderSection(STORED)
    await user.click(screen.getByRole('tab', { name: 'Rewind generation' }))

    // P10.7: opening the page asks the provider for nothing
    expect(mockList).not.toHaveBeenCalled()
    await user.click(screen.getByTestId('settings-ai-test'))
    await waitFor(() => expect(screen.getByTestId('settings-ai-test-result')).toHaveTextContent('Connected: 3 models available'))
    // A blank key: the server reuses the stored one for the same provider
    expect(mockList).toHaveBeenCalledWith({ purpose: 'wrapped', provider: 'openai', apiKey: undefined, baseUrl: undefined })

    await user.click(screen.getByTestId('settings-ai-edit'))
    // P10.20: the saved key is a masked placeholder, never a value
    expect(screen.getByTestId('llm-api-key-input')).toHaveAttribute('placeholder', '••••••••••••')
    expect(screen.getByTestId('llm-api-key-input')).toHaveValue('')
    expect(screen.getByTestId('llm-temperature-input')).toHaveValue(0.8)

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

  it('has nothing to test on a tab with no saved provider', async () => {
    const user = setup()
    renderSection(STORED)

    await user.click(screen.getByTestId('settings-ai-test'))

    await waitFor(() => expect(screen.getByTestId('settings-ai-test-result')).toHaveTextContent('Nothing to test yet'))
    expect(mockList).not.toHaveBeenCalled()
  })
})

describe('AI section, edit mode', () => {
  it('opens the open tab on Edit, focused on its provider, and a clean Save just closes', async () => {
    const user = await openForm(STORED)

    expect(screen.getByTestId('llm-provider-form-wrapped')).toBeInTheDocument()
    expect(screen.getByTestId('settings-ai-tab-wrapped')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('llm-provider-select')).toHaveFocus()
    expect(screen.getByTestId('settings-ai-editing')).toBeInTheDocument()
    // The AI switch stays live, outside the form
    expect(screen.getByTestId('settings-ai-form')).not.toContainElement(screen.getByTestId('settings-ai-features'))
    expect(screen.getByTestId('settings-ai-save')).toBeEnabled()

    await user.click(screen.getByTestId('settings-ai-save'))

    expect(screen.getByTestId('settings-ai-summary-wrapped')).toBeInTheDocument()
    expect(screen.queryByTestId('llm-provider-form-wrapped')).not.toBeInTheDocument()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('asks before Cancel throws changes away, and discarding returns to the saved values', async () => {
    const user = await openForm(STORED)

    await user.clear(screen.getByTestId('llm-max-tokens-input'))
    await user.type(screen.getByTestId('llm-max-tokens-input'), '7000')
    expect(screen.getByTestId('settings-ai-unsaved')).toBeInTheDocument()
    expect(screen.getByTestId('settings-ai-tab-wrapped')).toHaveTextContent('(unsaved changes)')

    await user.click(screen.getByTestId('settings-ai-cancel'))
    expect(await screen.findByTestId('settings-ai-discard-dialog')).toBeInTheDocument()
    await user.click(screen.getByTestId('settings-ai-discard-dialog-confirm'))

    await waitFor(() => expect(screen.getByTestId('settings-ai-summary-wrapped-max-tokens')).toHaveTextContent('6,000'))
    await user.click(screen.getByTestId('settings-ai-edit'))
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

  it('saves only the settings the model supports, then returns to the summary with focus on Edit', async () => {
    mockSave.mockResolvedValue({ success: true, data: null })
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
    await waitFor(() => expect(screen.getByTestId('settings-ai-edit')).toHaveFocus())
    expect(screen.queryByTestId('llm-provider-form-wrapped')).not.toBeInTheDocument()
    // The action revalidates /admin/settings, so no client refresh follows (P10.7)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('stays open on a failed save, with the error on its field, and Cancel clears it', async () => {
    mockSave.mockResolvedValue({ success: false, code: 'VALIDATION', error: 'Check the key', fieldErrors: { apiKey: ['The provider refused this key'] } })
    const user = await openForm()

    await choose(user, 'llm-model-select', 'gpt-4o')
    await user.type(screen.getByTestId('llm-api-key-input'), 'sk-wrong')
    await user.click(screen.getByTestId('settings-ai-save'))

    expect(await screen.findByText('The provider refused this key')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('llm-api-key-input')).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByTestId('settings-ai-editing')).toBeInTheDocument()
    expect(mockShowError).not.toHaveBeenCalled()

    // Cancel waits for the save to settle
    await waitFor(() => expect(screen.getByTestId('settings-ai-cancel')).toBeEnabled())
    await user.click(screen.getByTestId('settings-ai-cancel'))
    await user.click(await screen.findByTestId('settings-ai-discard-dialog-confirm'))
    await user.click(await screen.findByTestId('settings-ai-edit'))
    expect(screen.queryByText('The provider refused this key')).not.toBeInTheDocument()
  })

  it('stops a save without a model on the model field, and stays open', async () => {
    const user = await openForm()

    await user.type(screen.getByTestId('llm-max-tokens-input'), '4000')
    await user.click(screen.getByTestId('settings-ai-save'))
    await settle()

    expect(mockSave).not.toHaveBeenCalled()
    expect(screen.getByText('Choose a model')).toBeInTheDocument()
    expect(screen.getByTestId('settings-ai-editing')).toBeInTheDocument()
    expect(screen.getByTestId('llm-max-tokens-input')).toHaveValue(4000)
  })

  it('opens the other tab when only its part failed, so its error shows', async () => {
    mockSave.mockResolvedValue({ success: false, code: 'VALIDATION', error: 'Check the key', fieldErrors: { apiKey: ['The provider refused this key'] } })
    const user = await openForm(STORED)

    await user.clear(screen.getByTestId('llm-max-tokens-input'))
    await user.type(screen.getByTestId('llm-max-tokens-input'), '7000')
    await user.click(screen.getByTestId('settings-ai-tab-chat'))
    await waitFor(() => expect(screen.queryByTestId('llm-provider-form-wrapped')).not.toBeInTheDocument())
    await user.click(screen.getByTestId('settings-ai-save'))
    await settle()

    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 7000 }))
    expect(screen.getByTestId('settings-ai-tab-wrapped')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('The provider refused this key')).toBeInTheDocument()
    expect(screen.getByTestId('settings-ai-editing')).toBeInTheDocument()
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
