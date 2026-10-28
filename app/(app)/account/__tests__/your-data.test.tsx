/**
 * The account page's "Your data" section (P11.15): the marks table with Delete in each row's menu, and the watchlist and
 * conversation lists, each delete behind a confirm.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { resetUrl } from '@/__tests__/helpers/url-router'
import { deleteMyMark, forgetWatchlistItem } from '@/actions/member-data'
import { YourDataSection } from '@/components/account/your-data-section'
import type { YourData } from '@/lib/member/your-data'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/member-data', () => ({ deleteMyMark: jest.fn(), forgetWatchlistItem: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const AT = '2026-12-01T09:00:00.000Z'

const DATA: YourData = {
  marks: { page: 1, total: 1, rows: [{ id: 'mark-1', title: 'Arrival (2016)', mark: 'Finished watching', markedAt: AT }] },
  watchlist: { total: 1, rows: [{ id: 'item-1', title: 'Dune (2021)', at: AT }] },
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl('/account')
})

describe('YourDataSection', () => {
  it('renders the disclosure and the two lists', () => {
    render(<YourDataSection data={DATA} disclosure="Server admins can read assistant conversations." />)

    const section = screen.getByTestId('account-your-data')
    expect(within(section).getByRole('heading', { level: 2, name: 'Your data' })).toBeInTheDocument()
    expect(section).toHaveTextContent('Server admins can read assistant conversations.')
    for (const title of ['Marks', 'Watchlist history']) {
      expect(within(section).getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
    }
    expect(screen.getByText('Arrival (2016)')).toBeInTheDocument()
    expect(screen.getByText('Dune (2021)')).toBeInTheDocument()
    expect(screen.getByTestId('account-rewind-link')).toHaveAttribute('href', '/rewind')
  })

  it("deletes a mark from its row's menu after a confirm", async () => {
    const user = userEvent.setup()
    jest.mocked(deleteMyMark).mockResolvedValue({ success: true, data: null })
    render(<YourDataSection data={DATA} disclosure="" />)

    await user.click(screen.getByRole('button', { name: 'Actions for Arrival (2016)' }))
    await user.click(await screen.findByTestId('account-mark-delete-mark-1'))
    expect(await screen.findByTestId('account-mark-delete-dialog')).toHaveTextContent('Delete your mark on Arrival (2016)?')
    await user.click(screen.getByTestId('account-mark-delete-confirm'))

    expect(deleteMyMark).toHaveBeenCalledWith({ markId: 'mark-1' })
    expect(mockShowSuccess).toHaveBeenCalledWith('Mark deleted')
  })

  it('forgets a watchlist item, warning that it can be requested again', async () => {
    const user = userEvent.setup()
    jest.mocked(forgetWatchlistItem).mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'That item is already gone' })
    render(<YourDataSection data={DATA} disclosure="" />)

    await user.click(screen.getByTestId('account-watchlist-forget-item-1'))
    const dialog = await screen.findByTestId('account-watchlist-forget-dialog')
    expect(dialog).toHaveTextContent('the next sync can request it again')
    await user.click(screen.getByTestId('account-watchlist-forget-confirm'))

    expect(forgetWatchlistItem).toHaveBeenCalledWith({ historyId: 'item-1' })
    expect(await within(dialog).findByText('That item is already gone')).toBeInTheDocument()
  })
})
