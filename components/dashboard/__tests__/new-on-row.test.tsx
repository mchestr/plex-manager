/**
 * Home's "New on" row (P10.12): the server name in the heading, Plex web
 * links that open in a new tab, titles and meta as text, nothing at all when
 * there is nothing to show, and the title card when a poster fails.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'

import { NewOnRow } from '@/components/dashboard/new-on-row'
import { getNewOn, type NewOn } from '@/lib/member/new-on'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/rewind/item-links', () => ({ plexServerId: jest.fn() }))
jest.mock('@/lib/member/new-on', () => ({
  ...jest.requireActual('@/lib/member/new-on'),
  getNewOn: jest.fn(),
}))

const FORMAT = { timeZone: 'UTC', locale: 'en-US' }
const href = (key: string) => `https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F${key}`

const ROW: NewOn = {
  items: [
    { ratingKey: '50101', title: 'Glasshouse', year: 2026, kind: 'movie', seasons: null, href: href('50101') },
    { ratingKey: '70210', title: 'Northbound', year: 2026, kind: 'show', seasons: 1, href: href('70210') },
  ],
  addedThisWeek: 1037,
}

async function renderRow(row: NewOn, browseUrl: string | null = 'https://app.plex.tv/desktop/#!/media/abc123/com.plexapp.plugins.library') {
  jest.mocked(getNewOn).mockResolvedValue(row)
  const element = await NewOnRow({ userId: 'member-1', isAdmin: false, serverName: 'Northfield Plex', browseUrl, format: FORMAT })
  return render(<>{element}</>)
}

describe('NewOnRow', () => {
  it('names the server in its heading and counts the week', async () => {
    await renderRow(ROW)

    expect(screen.getByRole('heading', { level: 2, name: 'New on Northfield Plex' })).toBeInTheDocument()
    expect(screen.getByText('1,037 new titles this week')).toBeInTheDocument()
    expect(getNewOn).toHaveBeenCalledWith({ userId: 'member-1', isAdmin: false })
  })

  it('links each title to its Plex web page in a new tab', async () => {
    await renderRow(ROW)

    for (const item of ROW.items) {
      const link = screen.getByTestId(`home-new-on-item-${item.ratingKey}`)
      expect(link).toHaveAttribute('href', item.href)
      expect(link.getAttribute('href')).toMatch(/^https:\/\/app\.plex\.tv\/desktop\/#!\/server\/[A-Za-z0-9-]+\/details\?key=%2Flibrary%2Fmetadata%2F\d+$/)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(within(link).getByText('(opens Plex)')).toHaveClass('sr-only')
    }
    const browse = screen.getByTestId('home-new-on-browse')
    expect(browse).toHaveAttribute('href', 'https://app.plex.tv/desktop/#!/media/abc123/com.plexapp.plugins.library')
    expect(browse).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('sets titles and meta as text under the art', async () => {
    await renderRow(ROW)

    const film = screen.getByTestId('home-new-on-item-50101')
    expect(within(film).getByText('Glasshouse')).toBeInTheDocument()
    expect(within(film).getByText('Movie, 2026')).toBeInTheDocument()
    expect(within(screen.getByTestId('home-new-on-item-70210')).getByText('Show, season 1')).toBeInTheDocument()
    // the art is decorative and loads lazily
    const img = film.querySelector('img')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('src', expect.stringContaining('/api/rewind/poster/50101'))
  })

  it('renders nothing when there is nothing to show', async () => {
    const { container } = await renderRow({ items: [], addedThisWeek: null })

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId('home-new-on-row')).not.toBeInTheDocument()
  })

  it('shows the title card when a poster fails', async () => {
    await renderRow(ROW)

    const film = screen.getByTestId('home-new-on-item-50101')
    fireEvent.error(film.querySelector('img')!)

    expect(film.querySelector('img')).toBeNull()
    expect(film.querySelector('[data-slot="poster"]')).toHaveAttribute('data-state', 'fallback')
    expect(within(film).getAllByText('Glasshouse')).toHaveLength(2)
  })

  it('leaves out the count line and the browse button when unknown', async () => {
    await renderRow({ ...ROW, addedThisWeek: null }, null)

    expect(screen.queryByText(/added this week/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-new-on-browse')).not.toBeInTheDocument()
  })

  it('renders an unlinked title when the server has no web address', async () => {
    await renderRow({ items: [{ ...ROW.items[0], href: null }], addedThisWeek: 1 })

    expect(screen.getByTestId('home-new-on-item-50101').tagName).toBe('DIV')
    expect(screen.getByText('1 new title this week')).toBeInTheDocument()
  })
})
