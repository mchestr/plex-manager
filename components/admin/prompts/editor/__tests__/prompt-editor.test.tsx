import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createPromptTemplate, updatePromptTemplate } from '@/actions/prompts'
import { PromptEditor } from '@/components/admin/prompts/editor/prompt-editor'
import { PromptPreview } from '@/components/admin/prompts/editor/prompt-preview'
import { StyleGuideField } from '@/components/admin/prompts/editor/style-guide-field'
import { systemPrompt } from '@/lib/wrapped/prompt/rewind-2026'

const mockPush = jest.fn()
const mockShowSuccess = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))
jest.mock('@/actions/prompts', () => ({ createPromptTemplate: jest.fn(), updatePromptTemplate: jest.fn() }))

const mockCreate = createPromptTemplate as unknown as jest.Mock
const mockUpdate = updatePromptTemplate as unknown as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('StyleGuideField', () => {
  it('wires the counter and the 1,201-character error to the field', () => {
    render(<StyleGuideField value={'a'.repeat(1201)} onChange={jest.fn()} error="A style guide is at most 1,200 characters" />)

    const field = screen.getByRole('textbox', { name: 'Style guide' })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(expect.stringContaining('1,201 of 1,200 characters'))
    expect(field).toHaveAccessibleDescription(expect.stringContaining('A style guide is at most 1,200 characters'))
  })

  it('announces politely only at 90% and at the limit', () => {
    const { container, rerender } = render(<StyleGuideField value={'a'.repeat(820)} onChange={jest.fn()} />)
    const live = container.querySelector('[aria-live="polite"]')
    expect(screen.getByTestId('admin-prompt-editor-counter')).toHaveTextContent('820 of 1,200 characters')
    expect(live).toHaveTextContent('')

    rerender(<StyleGuideField value={'a'.repeat(1080)} onChange={jest.fn()} />)
    expect(live).toHaveTextContent('Nearly at the limit: 1,080 of 1,200 characters')

    rerender(<StyleGuideField value={'a'.repeat(1200)} onChange={jest.fn()} />)
    expect(live).toHaveTextContent('Limit reached: 1,200 of 1,200 characters')
  })
})

describe('PromptPreview', () => {
  it('shows exactly what systemPrompt() builds, with the style guide marked', () => {
    render(<PromptPreview styleGuide="Short sentences." />)

    const preview = screen.getByTestId('admin-prompt-editor-preview')
    expect(preview.textContent).toBe(systemPrompt('Short sentences.'))
    expect(preview.querySelector('mark')).toHaveTextContent('Short sentences.')
  })

  it('marks nothing without a style guide', () => {
    render(<PromptPreview styleGuide="" />)

    expect(screen.getByTestId('admin-prompt-editor-preview').textContent).toBe(systemPrompt(null))
    expect(screen.getByTestId('admin-prompt-editor-preview').querySelector('mark')).toBeNull()
  })
})

describe('PromptEditor', () => {
  const guide = { id: 'g1', name: 'House style', description: null, template: 'Short.', isActive: false, kind: 'rewind-style-guide' }

  it('opens a v2 template read-only, with the notice and a copy link', () => {
    render(<PromptEditor prompt={{ ...guide, id: 'v1', kind: 'v2-full', template: 'Hello {{userName}}' }} cancelHref="/admin/prompts" />)

    expect(screen.getByTestId('admin-prompt-editor-v2-notice')).toHaveTextContent("this text isn't used")
    expect(screen.getByTestId('admin-prompt-editor-style-guide')).toHaveAttribute('readonly')
    expect(screen.getByTestId('admin-prompt-editor-name')).toHaveAttribute('readonly')
    expect(screen.queryByTestId('admin-prompt-editor-save')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-prompt-editor-preview')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Copy into a new style guide' })).toHaveAttribute('href', '/admin/prompts/new?from=v1')
  })

  it('updates the preview as you type, and undoes with the toolbar', async () => {
    const user = userEvent.setup()
    render(<PromptEditor prompt={guide} cancelHref="/admin/prompts/g1" />)

    const field = screen.getByTestId('admin-prompt-editor-style-guide')
    fireEvent.change(field, { target: { value: 'Short. Warm.' } })
    expect(screen.getByTestId('admin-prompt-editor-preview').textContent).toBe(systemPrompt('Short. Warm.'))
    expect(screen.getByTestId('admin-prompt-editor-status')).toHaveTextContent('Unsaved changes')

    await user.click(screen.getByTestId('admin-prompt-editor-undo'))
    expect(field).toHaveValue('Short.')
    await user.click(screen.getByTestId('admin-prompt-editor-redo'))
    expect(field).toHaveValue('Short. Warm.')
  })

  it('shows the placeholder error inline and does not save', async () => {
    const user = userEvent.setup()
    render(<PromptEditor prompt={guide} cancelHref="/admin/prompts/g1" />)

    fireEvent.change(screen.getByTestId('admin-prompt-editor-style-guide'), { target: { value: 'Hi {{userName}}' } })
    expect(screen.getByText('A style guide cannot use placeholders')).toBeInTheDocument()
    await user.click(screen.getByTestId('admin-prompt-editor-save'))
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('creates a style guide and opens it', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({ success: true, data: { id: 'new1' } })
    render(<PromptEditor cancelHref="/admin/prompts" />)

    await user.type(screen.getByTestId('admin-prompt-editor-name'), 'Plain')
    fireEvent.change(screen.getByTestId('admin-prompt-editor-style-guide'), { target: { value: 'Plain words.' } })
    await user.click(screen.getByTestId('admin-prompt-editor-save'))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/admin/prompts/new1'))
    expect(mockCreate).toHaveBeenCalledWith({ name: 'Plain', description: '', template: 'Plain words.', isActive: false })
  })

  it('keeps the text and shows the server error when the save fails', async () => {
    const user = userEvent.setup()
    mockUpdate.mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Failed to save the style guide' })
    render(<PromptEditor prompt={guide} cancelHref="/admin/prompts/g1" />)

    fireEvent.change(screen.getByTestId('admin-prompt-editor-style-guide'), { target: { value: 'Kept.' } })
    await user.click(screen.getByTestId('admin-prompt-editor-save'))

    expect(await screen.findByText('Failed to save the style guide')).toBeInTheDocument()
    expect(screen.getByTestId('admin-prompt-editor-style-guide')).toHaveValue('Kept.')
    expect(mockPush).not.toHaveBeenCalled()
  })
})
