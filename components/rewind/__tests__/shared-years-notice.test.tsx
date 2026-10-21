/**
 * The notice on /rewind/<year> that lets a member stop the public v2 links
 * still on, which is where most links minted before sharing became opt-in
 * sit (P0.19, SEC-16).
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { disableWrappedShareLink } from '@/actions/wrapped-share-link'
import { ToastProvider } from '@/components/ui/toast'
import { RewindSharedYearsNotice } from '@/components/rewind/shared-years-notice'

jest.mock('@/actions/wrapped-share-link', () => ({
  disableWrappedShareLink: jest.fn(),
}))

const mockDisable = disableWrappedShareLink as jest.Mock

function renderNotice(years: number[]) {
  return render(
    <ToastProvider>
      <RewindSharedYearsNotice years={years} />
    </ToastProvider>
  )
}

describe('RewindSharedYearsNotice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders nothing when no other year has a link', () => {
    renderNotice([])

    expect(screen.queryByTestId('rewind-shared-years')).not.toBeInTheDocument()
  })

  it('offers "Stop sharing" for every year with a live link', () => {
    renderNotice([2025, 2024])

    const notice = screen.getByTestId('rewind-shared-years')
    expect(within(notice).getByText('Public links are still on')).toBeInTheDocument()
    expect(screen.getByTestId('rewind-share-stop-2025')).toHaveTextContent('Stop sharing 2025')
    expect(screen.getByTestId('rewind-share-stop-2024')).toHaveTextContent('Stop sharing 2024')
  })

  it('stops the chosen year and removes it from the list', async () => {
    const user = userEvent.setup()
    mockDisable.mockResolvedValue({ success: true })
    renderNotice([2025, 2024])

    await user.click(screen.getByTestId('rewind-share-stop-2025'))

    await waitFor(() => expect(screen.queryByTestId('rewind-share-stop-2025')).not.toBeInTheDocument())
    expect(mockDisable).toHaveBeenCalledTimes(1)
    expect(mockDisable).toHaveBeenCalledWith({ year: 2025 })
    expect(screen.getByTestId('rewind-share-stop-2024')).toBeInTheDocument()
    expect(screen.getByText('Sharing stopped for 2025. The link no longer opens.')).toBeInTheDocument()
  })

  it('disappears once the last link is stopped', async () => {
    const user = userEvent.setup()
    mockDisable.mockResolvedValue({ success: true })
    renderNotice([2025])

    await user.click(screen.getByTestId('rewind-share-stop-2025'))

    await waitFor(() => expect(screen.queryByTestId('rewind-shared-years')).not.toBeInTheDocument())
  })

  it('disables the buttons while a link is being stopped', async () => {
    const user = userEvent.setup()
    let resolveDisable: (value: unknown) => void = () => {}
    mockDisable.mockReturnValue(new Promise((resolve) => { resolveDisable = resolve }))
    renderNotice([2025, 2024])

    await user.click(screen.getByTestId('rewind-share-stop-2025'))

    await waitFor(() => expect(screen.getByTestId('rewind-share-stop-2025')).toBeDisabled())
    expect(screen.getByTestId('rewind-share-stop-2025')).toHaveTextContent('Stopping…')
    expect(screen.getByTestId('rewind-share-stop-2024')).toBeDisabled()

    resolveDisable({ success: true })
    await waitFor(() => expect(screen.getByTestId('rewind-share-stop-2024')).toBeEnabled())
  })

  it('keeps the year and shows the error when stopping fails', async () => {
    const user = userEvent.setup()
    mockDisable.mockResolvedValue({ success: false, error: 'Failed to stop sharing' })
    renderNotice([2025])

    await user.click(screen.getByTestId('rewind-share-stop-2025'))

    expect(await screen.findByText('Failed to stop sharing')).toBeInTheDocument()
    expect(screen.getByTestId('rewind-share-stop-2025')).toHaveTextContent('Stop sharing 2025')
  })
})
