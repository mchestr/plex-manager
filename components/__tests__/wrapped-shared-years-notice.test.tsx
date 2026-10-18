/**
 * The notice on /wrapped that lets a member stop public links on years the
 * viewer does not show, which is where most links minted before sharing
 * became opt-in sit (P0.19, SEC-16).
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { disableWrappedShareLink } from '@/actions/wrapped-share-link'
import { ToastProvider } from '@/components/ui/toast'
import { WrappedSharedYearsNotice } from '@/components/wrapped/wrapped-shared-years-notice'

jest.mock('@/actions/wrapped-share-link', () => ({
  disableWrappedShareLink: jest.fn(),
}))

const mockDisable = disableWrappedShareLink as jest.Mock

function renderNotice(years: number[]) {
  return render(
    <ToastProvider>
      <WrappedSharedYearsNotice years={years} />
    </ToastProvider>
  )
}

describe('WrappedSharedYearsNotice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders nothing when no other year has a link', () => {
    renderNotice([])

    expect(screen.queryByTestId('wrapped-shared-years')).not.toBeInTheDocument()
  })

  it('offers "Stop sharing" for every year with a live link', () => {
    renderNotice([2025, 2024])

    const notice = screen.getByTestId('wrapped-shared-years')
    expect(within(notice).getByText('Public links are still on')).toBeInTheDocument()
    expect(screen.getByTestId('wrapped-share-stop-2025')).toHaveTextContent('Stop sharing 2025')
    expect(screen.getByTestId('wrapped-share-stop-2024')).toHaveTextContent('Stop sharing 2024')
  })

  it('stops the chosen year and removes it from the list', async () => {
    const user = userEvent.setup()
    mockDisable.mockResolvedValue({ success: true })
    renderNotice([2025, 2024])

    await user.click(screen.getByTestId('wrapped-share-stop-2025'))

    await waitFor(() => expect(screen.queryByTestId('wrapped-share-stop-2025')).not.toBeInTheDocument())
    expect(mockDisable).toHaveBeenCalledTimes(1)
    expect(mockDisable).toHaveBeenCalledWith({ year: 2025 })
    expect(screen.getByTestId('wrapped-share-stop-2024')).toBeInTheDocument()
    expect(screen.getByText('Sharing stopped for 2025. The link no longer opens.')).toBeInTheDocument()
  })

  it('disappears once the last link is stopped', async () => {
    const user = userEvent.setup()
    mockDisable.mockResolvedValue({ success: true })
    renderNotice([2025])

    await user.click(screen.getByTestId('wrapped-share-stop-2025'))

    await waitFor(() => expect(screen.queryByTestId('wrapped-shared-years')).not.toBeInTheDocument())
  })

  it('disables the buttons while a link is being stopped', async () => {
    const user = userEvent.setup()
    let resolveDisable: (value: unknown) => void = () => {}
    mockDisable.mockReturnValue(new Promise((resolve) => { resolveDisable = resolve }))
    renderNotice([2025, 2024])

    await user.click(screen.getByTestId('wrapped-share-stop-2025'))

    await waitFor(() => expect(screen.getByTestId('wrapped-share-stop-2025')).toBeDisabled())
    expect(screen.getByTestId('wrapped-share-stop-2025')).toHaveTextContent('Stopping…')
    expect(screen.getByTestId('wrapped-share-stop-2024')).toBeDisabled()

    resolveDisable({ success: true })
    await waitFor(() => expect(screen.getByTestId('wrapped-share-stop-2024')).toBeEnabled())
  })

  it('keeps the year and shows the error when stopping fails', async () => {
    const user = userEvent.setup()
    mockDisable.mockResolvedValue({ success: false, error: 'Failed to stop sharing' })
    renderNotice([2025])

    await user.click(screen.getByTestId('wrapped-share-stop-2025'))

    expect(await screen.findByText('Failed to stop sharing')).toBeInTheDocument()
    expect(screen.getByTestId('wrapped-share-stop-2025')).toHaveTextContent('Stop sharing 2025')
  })
})
