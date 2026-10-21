import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { resetUrl } from '@/__tests__/helpers/url-router'
import { adminRegenerateRewind } from '@/actions/rewind-generation'
import { RewindTable, type RewindTableRow } from '@/components/admin/users/detail/rewind-table'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/rewind-generation', () => ({ adminRegenerateRewind: jest.fn() }))
jest.mock('@/actions/admin/rewind-season', () => ({ getRewindRollbackTarget: jest.fn(), rollbackRewind: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const mockRegenerate = adminRegenerateRewind as jest.MockedFunction<typeof adminRegenerateRewind>

function row(overrides: Partial<RewindTableRow>): RewindTableRow {
  return {
    wrappedId: 'w-2026',
    year: 2026,
    state: 'stuck',
    edition: 'Full',
    generated: 'Nov 20, 2026, 4:00 AM CST',
    shared: false,
    visits: '0',
    canRollBack: false,
    canRegenerate: true,
    versions: [],
    ...overrides,
  }
}

const ROWS = [
  row({}),
  row({ wrappedId: 'w-2025', year: 2025, state: 'ready', canRegenerate: false, canRollBack: true, versions: [{ id: 'usage-1', label: 'Version of Dec 1, 2025, 6:00 PM CST' }] }),
]

describe('RewindTable', () => {
  beforeEach(() => {
    resetUrl('/admin/users/u1?tab=rewind')
    jest.clearAllMocks()
  })

  it('links each year to its preview and names each row button by year', () => {
    render(<RewindTable userId="u1" name="Morgan Lee" rows={ROWS} estimateCopy="" />)

    expect(screen.getByRole('link', { name: '2026' })).toHaveAttribute('href', '/admin/users/u1/rewind/2026')
    expect(screen.getByRole('button', { name: 'Actions for 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for 2025' })).toBeInTheDocument()
    expect(screen.getByTestId('admin-user-rewind-status-2026')).toHaveTextContent('Stuck')
  })

  it('offers Regenerate only on an eligible row, and the history pages on rows with versions', async () => {
    const user = userEvent.setup()
    render(<RewindTable userId="u1" name="Morgan Lee" rows={ROWS} estimateCopy="" />)

    await user.click(screen.getByRole('button', { name: 'Actions for 2025' }))
    expect(await screen.findByRole('menuitem', { name: 'Version of Dec 1, 2025, 6:00 PM CST' })).toHaveAttribute('href', '/admin/wrapped/w-2025/history/usage-1')
    expect(screen.queryByRole('menuitem', { name: 'Regenerate...' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Roll back...' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Actions for 2026' }))
    expect(await screen.findByRole('menuitem', { name: 'Regenerate...' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Roll back...' })).not.toBeInTheDocument()
  })

  it('regenerates through a confirm that carries the cost estimate', async () => {
    const user = userEvent.setup()
    mockRegenerate.mockResolvedValue({ success: true, data: { alreadyQueued: false } })
    render(<RewindTable userId="u1" name="Morgan Lee" rows={ROWS} estimateCopy="About $0.02 of the $10.00 season budget." />)

    await user.click(screen.getByRole('button', { name: 'Actions for 2026' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Regenerate...' }))

    const dialog = await screen.findByTestId('admin-user-regenerate-dialog')
    expect(dialog).toHaveTextContent("Regenerate Morgan Lee's Rewind 2026?")
    expect(dialog).toHaveTextContent('About $0.02 of the $10.00 season budget.')
    await user.click(screen.getByTestId('admin-user-regenerate-confirm'))

    expect(mockRegenerate).toHaveBeenCalledWith({ userId: 'u1', year: 2026 })
  })
})
