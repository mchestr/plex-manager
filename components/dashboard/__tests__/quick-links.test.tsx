/**
 * QuickLinks (P10.21, UI-38): only the tiles that go somewhere, the Plex Web
 * URL by machine id, Jellyfin by its own name, no jellyfin.org fallback, and
 * each Discord state on `/discord/link`.
 */

import { render, screen, within } from '@testing-library/react'

import { QuickLinks, type QuickLinksProps } from '@/components/dashboard/quick-links'

const PLEX_WEB = 'https://app.plex.tv/desktop/#!/media/abc123/com.plexapp.plugins.library'

function props(overrides: Partial<QuickLinksProps> = {}): QuickLinksProps {
  return {
    media: { service: 'plex', serverName: 'Northfield Plex', url: PLEX_WEB },
    requestsUrl: 'https://requests.example.com',
    discord: { linkEnabled: true, handle: null, inviteUrl: null, supportChannelUrl: null },
    ...overrides,
  }
}

describe('QuickLinks', () => {
  it("opens the server's own Plex Web app in a new tab", () => {
    render(<QuickLinks {...props()} />)

    const tile = screen.getByTestId('home-quick-link-media')
    expect(tile).toHaveAttribute('href', PLEX_WEB)
    expect(tile).toHaveAttribute('target', '_blank')
    expect(tile).toHaveAttribute('rel', 'noopener noreferrer')
    expect(tile).toHaveTextContent('Watch on Plex')
    expect(tile).toHaveTextContent('Open Northfield Plex in Plex Web')
  })

  it('names the Jellyfin server and never falls back to jellyfin.org', () => {
    const { container, rerender } = render(
      <QuickLinks {...props({ media: { service: 'jellyfin', serverName: 'Basement Jelly', url: 'https://jf.example.com' } })} />
    )

    expect(screen.getByTestId('home-quick-link-media')).toHaveAttribute('href', 'https://jf.example.com')
    expect(screen.getByTestId('home-quick-link-media')).toHaveTextContent('Open Basement Jelly')

    rerender(<QuickLinks {...props({ media: { service: 'jellyfin', serverName: 'Basement Jelly', url: null } })} />)

    expect(screen.queryByTestId('home-quick-link-media')).not.toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/jellyfin\.org/)
  })

  it('never names Overseerr on the requests tile', () => {
    render(<QuickLinks {...props()} />)

    const tile = screen.getByTestId('home-quick-link-requests')
    expect(tile).toHaveAttribute('href', 'https://requests.example.com')
    expect(tile).not.toHaveTextContent(/overseerr/i)
  })

  it('offers Link Discord before linking and the handle after, both on /discord/link', () => {
    const { rerender } = render(<QuickLinks {...props()} />)

    expect(screen.getByTestId('home-quick-link-discord')).toHaveAttribute('href', '/discord/link')
    expect(screen.getByTestId('home-quick-link-discord')).toHaveTextContent('Link Discord')

    rerender(
      <QuickLinks
        {...props({ discord: { linkEnabled: true, handle: 'morgan.lee', inviteUrl: null, supportChannelUrl: null } })}
      />
    )

    expect(screen.getByTestId('home-quick-link-discord')).toHaveAttribute('href', '/discord/link')
    expect(screen.getByTestId('home-quick-link-discord')).toHaveTextContent('Linked as morgan.lee')
  })

  it('adds Join when an invite code exists, even with linking off', () => {
    render(
      <QuickLinks
        {...props({
          discord: { linkEnabled: false, handle: null, inviteUrl: 'https://discord.gg/abc', supportChannelUrl: null },
        })}
      />
    )

    expect(screen.queryByTestId('home-quick-link-discord')).not.toBeInTheDocument()
    expect(screen.getByTestId('home-quick-link-discord-join')).toHaveAttribute('href', 'https://discord.gg/abc')
  })

  it('renders only real tiles, with no placeholder cells', () => {
    render(<QuickLinks {...props({ requestsUrl: null, discord: null })} />)

    const list = within(screen.getByTestId('home-quick-links')).getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(list.querySelector('.hidden')).toBeNull()
  })

  it('renders nothing when no tile can work', () => {
    const { container } = render(
      <QuickLinks
        {...props({ media: { service: 'plex', serverName: 'Northfield Plex', url: null }, requestsUrl: null, discord: null })}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
