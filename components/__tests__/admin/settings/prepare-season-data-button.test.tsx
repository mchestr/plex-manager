/**
 * The "Prepare season data" button (P2.6).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { prepareRewindSeasonData } from '@/actions/admin/rewind-season'
import { PrepareSeasonDataButton } from '@/components/admin/settings/prepare-season-data-button'

jest.mock('@/actions/admin/rewind-season', () => ({ prepareRewindSeasonData: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const mockPrepare = prepareRewindSeasonData as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('PrepareSeasonDataButton', () => {
  it('shows when the season data was last prepared', () => {
    render(<PrepareSeasonDataButton year={2026} preparedAt="2026-11-02T14:05" zone="America/Chicago" />)

    expect(screen.getByTestId('rewind-season-data-prepared-at')).toHaveTextContent(
      'Last prepared 2026-11-02 14:05 (America/Chicago)'
    )
  })

  it('says when the season data was never prepared', () => {
    render(<PrepareSeasonDataButton year={2026} preparedAt={null} zone="UTC" />)

    expect(screen.getByTestId('rewind-season-data-prepared-at')).toHaveTextContent('Not prepared yet')
  })

  it('queues the season data for the year and refreshes', async () => {
    const user = userEvent.setup()
    mockPrepare.mockResolvedValue({ success: true, alreadyQueued: false, through: '2026-11-30' })
    render(<PrepareSeasonDataButton year={2026} preparedAt={null} zone="UTC" />)

    await user.click(screen.getByTestId('rewind-prepare-season-data-button'))

    expect(mockPrepare).toHaveBeenCalledWith({ year: 2026 })
    expect(mockShowSuccess).toHaveBeenCalledWith('Preparing season data. This can take a few minutes.')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('says so when a run is already in progress', async () => {
    const user = userEvent.setup()
    mockPrepare.mockResolvedValue({ success: true, alreadyQueued: true, through: '2026-11-30' })
    render(<PrepareSeasonDataButton year={2026} preparedAt={null} zone="UTC" />)

    await user.click(screen.getByTestId('rewind-prepare-season-data-button'))

    expect(mockShowSuccess).toHaveBeenCalledWith('Season data is already being prepared')
  })

  it('shows the error, such as the FR-50 message', async () => {
    const user = userEvent.setup()
    mockPrepare.mockResolvedValue({ success: false, error: 'Rewind needs Redis (REDIS_URL)' })
    render(<PrepareSeasonDataButton year={2026} preparedAt={null} zone="UTC" />)

    await user.click(screen.getByTestId('rewind-prepare-season-data-button'))

    expect(mockShowError).toHaveBeenCalledWith('Rewind needs Redis (REDIS_URL)')
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
