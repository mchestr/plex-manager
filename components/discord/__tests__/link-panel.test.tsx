import { disconnectDiscordAccount, resyncDiscordRole } from '@/actions/discord'
import { DiscordLinkPanel } from '@/components/discord/link-panel'
import { useToast } from '@/components/ui/toast'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('@/actions/discord', () => ({
  disconnectDiscordAccount: jest.fn(),
  resyncDiscordRole: jest.fn(),
}))

jest.mock('@/components/ui/toast', () => ({
  useToast: jest.fn(),
}))

const mockDisconnect = disconnectDiscordAccount as jest.Mock
const mockResync = resyncDiscordRole as jest.Mock

const CONNECT_URL = '/discord/connect?redirect=%2Fdiscord%2Flink'

const connection = {
  username: 'member',
  discriminator: null,
  globalName: 'Member Name',
  linkedAt: new Date('2026-10-01T12:00:00Z'),
  metadataSyncedAt: null,
  lastError: null,
}

describe('DiscordLinkPanel', () => {
  const mockShowSuccess = jest.fn()
  const mockShowError = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useToast as jest.Mock).mockReturnValue({
      showSuccess: mockShowSuccess,
      showError: mockShowError,
    })
  })

  it('shows the unavailable state while the integration is disabled', () => {
    render(<DiscordLinkPanel connection={null} connectUrl={CONNECT_URL} isEnabled={false} serverInviteCode="abc" />)

    expect(screen.getByTestId('discord-link-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('discord-link-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('discord-link-connect')).not.toBeInTheDocument()
    expect(screen.getByTestId('discord-link-join-server')).toHaveAttribute('href', 'https://discord.gg/abc')
  })

  it('offers Join server and Link account when not linked', () => {
    render(
      <DiscordLinkPanel
        connection={null}
        connectUrl={CONNECT_URL}
        isEnabled
        serverInviteCode="abc"
        instructions="Read the rules first"
      />
    )

    expect(screen.getByTestId('discord-link-panel')).toHaveTextContent('Not linked')
    expect(screen.getByTestId('discord-link-connect')).toHaveAttribute('href', CONNECT_URL)
    expect(screen.getByTestId('discord-link-join-server')).toHaveAttribute('href', 'https://discord.gg/abc')
    expect(screen.getByText('Read the rules first')).toBeInTheDocument()
    expect(screen.queryByTestId('discord-link-disconnect')).not.toBeInTheDocument()
    expect(screen.queryByTestId('discord-link-resync')).not.toBeInTheDocument()
  })

  it('shows the linked account with Disconnect and Force resync', () => {
    render(<DiscordLinkPanel connection={connection} connectUrl={CONNECT_URL} isEnabled isOnServer />)

    expect(screen.getByTestId('discord-link-panel')).toHaveTextContent('Linked')
    expect(screen.getByText('Member Name')).toBeInTheDocument()
    expect(screen.getByTestId('discord-link-disconnect')).toBeInTheDocument()
    expect(screen.getByTestId('discord-link-resync')).toBeInTheDocument()
    expect(screen.queryByTestId('discord-link-connect')).not.toBeInTheDocument()
    expect(screen.queryByText(/not a member of our Discord server/)).not.toBeInTheDocument()
  })

  it('asks a linked member who is not on the server to join it', () => {
    render(
      <DiscordLinkPanel
        connection={connection}
        connectUrl={CONNECT_URL}
        isEnabled
        isOnServer={false}
        serverInviteCode="abc"
      />
    )

    expect(screen.getByText(/not a member of our Discord server/)).toBeInTheDocument()
    expect(screen.getByTestId('discord-link-join-server')).toHaveAttribute('href', 'https://discord.gg/abc')
  })

  it('disconnects and shows a success toast', async () => {
    const user = userEvent.setup()
    mockDisconnect.mockResolvedValue({ success: true })
    render(<DiscordLinkPanel connection={connection} connectUrl={CONNECT_URL} isEnabled />)

    await user.click(screen.getByTestId('discord-link-disconnect'))

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it('shows an error toast when disconnecting fails', async () => {
    const user = userEvent.setup()
    mockDisconnect.mockResolvedValue({ success: false, error: 'Nope' })
    render(<DiscordLinkPanel connection={connection} connectUrl={CONNECT_URL} isEnabled />)

    await user.click(screen.getByTestId('discord-link-disconnect'))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Nope'))
  })

  it('resyncs and shows a success toast', async () => {
    const user = userEvent.setup()
    mockResync.mockResolvedValue({ success: true })
    render(<DiscordLinkPanel connection={connection} connectUrl={CONNECT_URL} isEnabled />)

    await user.click(screen.getByTestId('discord-link-resync'))

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Role metadata synced successfully'))
    expect(mockResync).toHaveBeenCalledTimes(1)
  })

  it('shows an error toast when resync fails', async () => {
    const user = userEvent.setup()
    mockResync.mockResolvedValue({ success: false, error: 'Sync failed' })
    render(<DiscordLinkPanel connection={connection} connectUrl={CONNECT_URL} isEnabled />)

    await user.click(screen.getByTestId('discord-link-resync'))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Sync failed'))
  })
})
