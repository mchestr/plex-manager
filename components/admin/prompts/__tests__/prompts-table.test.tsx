import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PromptsTable } from '@/components/admin/prompts/prompts-table'
import type { PromptRow } from '@/lib/admin/prompts/queries'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/admin/prompts',
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
jest.mock('@/actions/prompts', () => ({ deletePromptTemplate: jest.fn(), setActivePromptTemplate: jest.fn() }))

const row = (overrides: Partial<PromptRow>): PromptRow => ({
  id: 'g1',
  name: 'House style',
  status: 'notInUse',
  version: 2,
  length: 820,
  updatedAt: '2026-10-17T12:00:00.000Z',
  updatedByName: 'Sam Rivera',
  ...overrides,
})

const rows = [
  row({ id: 'g1', name: 'House style', status: 'inUse' }),
  row({ id: 'g2', name: 'Dry wit', status: 'notInUse' }),
  row({ id: 'v1', name: 'Rewind narrator', status: 'v2', length: 4500 }),
]

describe('PromptsTable', () => {
  it('shows each row with its prompt status, length and a first-cell link', () => {
    render(<PromptsTable rows={rows} seasonNote={null} />)

    const inUse = screen.getByTestId('admin-prompts-row-g1')
    expect(within(inUse).getByText('In use')).toBeInTheDocument()
    expect(within(inUse).getByText('820 of 1,200')).toBeInTheDocument()
    expect(within(inUse).getByRole('link', { name: 'House style' })).toHaveAttribute('href', '/admin/prompts/g1')
    expect(within(screen.getByTestId('admin-prompts-row-g2')).getByText('Not in use')).toBeInTheDocument()
    expect(within(screen.getByTestId('admin-prompts-row-v1')).getByText('v2, not used')).toBeInTheDocument()
  })

  it('confirms Use for Rewind naming both style guides and the season', async () => {
    const user = userEvent.setup()
    render(<PromptsTable rows={rows} seasonNote="Rewinds regenerated before Jan 31 will use this voice." />)

    await user.click(screen.getByTestId('admin-prompts-actions-g2'))
    await user.click(await screen.findByRole('menuitem', { name: 'Use for Rewind...' }))

    const dialog = await screen.findByTestId('admin-prompt-activate-dialog')
    expect(dialog).toHaveTextContent('Use Dry wit for Rewind?')
    expect(dialog).toHaveTextContent('Rewind stops using House style and uses Dry wit instead.')
    expect(dialog).toHaveTextContent('Rewinds regenerated before Jan 31 will use this voice.')
  })

  it('disables Delete for the style guide in use', async () => {
    const user = userEvent.setup()
    render(<PromptsTable rows={rows} seasonNote={null} />)

    await user.click(screen.getByTestId('admin-prompts-actions-g1'))
    expect(await screen.findByRole('menuitem', { name: 'Delete...' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('shows the first-use empty state', () => {
    render(<PromptsTable rows={[]} seasonNote={null} />)

    expect(screen.getByText('No style guides yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New style guide' })).toHaveAttribute('href', '/admin/prompts/new')
  })
})
