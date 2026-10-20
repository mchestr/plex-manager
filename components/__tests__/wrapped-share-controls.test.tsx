/**
 * The owner's share-link controls: sharing is opt-in, and a member can stop a
 * link, including a v2 link minted before sharing became opt-in (P0.19, SEC-16).
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { disableWrappedShareLink, enableWrappedShareLink } from '@/actions/wrapped-share-link'
import { ToastProvider } from '@/components/ui/toast'
import { WrappedShareControls } from '@/components/wrapped/wrapped-share-controls'

jest.mock('@/actions/wrapped-share-link', () => ({
  enableWrappedShareLink: jest.fn(),
  disableWrappedShareLink: jest.fn(),
}))

// The copy button has its own suite; here it only shows which link it got.
jest.mock('@/components/wrapped/wrapped-share-button', () => ({
  WrappedShareButton: ({ shareToken }: { shareToken: string }) => (
    <div data-testid="share-button">{shareToken}</div>
  ),
}))

const mockEnable = enableWrappedShareLink as jest.Mock
const mockDisable = disableWrappedShareLink as jest.Mock
const onShareTokenChange = jest.fn()

/** The controls are controlled; the harness holds the token like the viewer wrapper does. */
function Harness({ initialShareToken }: { initialShareToken: string | null }) {
  const [shareToken, setShareToken] = useState(initialShareToken)
  return (
    <WrappedShareControls
      year={2026}
      shareToken={shareToken}
      onShareTokenChange={(token) => {
        onShareTokenChange(token)
        setShareToken(token)
      }}
    />
  )
}

function renderControls(shareToken: string | null) {
  return render(
    <ToastProvider>
      <Harness initialShareToken={shareToken} />
    </ToastProvider>
  )
}

function expectNoLinkState() {
  expect(screen.getByTestId('wrapped-share-create')).toHaveTextContent('Create share link')
  expect(screen.queryByTestId('wrapped-share-stop')).not.toBeInTheDocument()
  expect(screen.queryByTestId('share-button')).not.toBeInTheDocument()
  expect(screen.queryByTestId('wrapped-download-card')).not.toBeInTheDocument()
}

function expectSharedState(shareToken: string) {
  expect(screen.queryByTestId('wrapped-share-create')).not.toBeInTheDocument()
  expect(screen.getByTestId('wrapped-share-stop')).toHaveTextContent('Stop sharing')
  expect(screen.getByTestId('share-button')).toHaveTextContent(shareToken)
  expect(screen.getByTestId('wrapped-download-card')).toBeInTheDocument()
}

describe('WrappedShareControls', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('offers only "Create share link" when no link exists', () => {
    renderControls(null)

    expectNoLinkState()
  })

  it('creates a link for the year on request and then offers copy and stop', async () => {
    const user = userEvent.setup()
    mockEnable.mockResolvedValue({
      success: true,
      data: { shareToken: 'new-token', url: 'https://plex.example.com/wrapped/share/new-token' },
    })
    renderControls(null)

    await user.click(screen.getByTestId('wrapped-share-create'))

    await waitFor(() => expectSharedState('new-token'))
    expect(mockEnable).toHaveBeenCalledWith({ year: 2026 })
    expect(mockDisable).not.toHaveBeenCalled()
    expect(onShareTokenChange).toHaveBeenCalledWith('new-token')
  })

  it('disables the button while the link is being created', async () => {
    const user = userEvent.setup()
    let resolveEnable: (value: unknown) => void = () => {}
    mockEnable.mockReturnValue(new Promise((resolve) => { resolveEnable = resolve }))
    renderControls(null)

    await user.click(screen.getByTestId('wrapped-share-create'))

    await waitFor(() => expect(screen.getByTestId('wrapped-share-create')).toBeDisabled())
    expect(screen.getByTestId('wrapped-share-create')).toHaveTextContent('Creating link…')

    resolveEnable({ success: false, error: 'Failed to create share link' })
    await waitFor(() => expect(screen.getByTestId('wrapped-share-create')).toBeEnabled())
  })

  it('shows the error and stays unshared when creating fails', async () => {
    const user = userEvent.setup()
    mockEnable.mockResolvedValue({
      success: false,
      code: 'RATE_LIMITED',
      error: 'Too many share links created. Please try again later.',
    })
    renderControls(null)

    await user.click(screen.getByTestId('wrapped-share-create'))

    expect(await screen.findByText('Too many share links created. Please try again later.')).toBeInTheDocument()
    expectNoLinkState()
    expect(onShareTokenChange).not.toHaveBeenCalled()
  })

  it('lets the owner of a surviving link stop sharing', async () => {
    const user = userEvent.setup()
    mockDisable.mockResolvedValue({ success: true, data: null })
    renderControls('surviving-v2-token')
    expectSharedState('surviving-v2-token')

    await user.click(screen.getByTestId('wrapped-share-stop'))

    await waitFor(() => expectNoLinkState())
    expect(mockDisable).toHaveBeenCalledWith({ year: 2026 })
    expect(mockEnable).not.toHaveBeenCalled()
    expect(onShareTokenChange).toHaveBeenCalledWith(null)
    expect(screen.getByText(/Sharing stopped\. The link no longer opens/)).toBeInTheDocument()
  })

  it('keeps the link and shows the error when stopping fails', async () => {
    const user = userEvent.setup()
    mockDisable.mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Failed to stop sharing' })
    renderControls('surviving-v2-token')

    await user.click(screen.getByTestId('wrapped-share-stop'))

    expect(await screen.findByText('Failed to stop sharing')).toBeInTheDocument()
    expectSharedState('surviving-v2-token')
    expect(onShareTokenChange).not.toHaveBeenCalled()
  })
})
