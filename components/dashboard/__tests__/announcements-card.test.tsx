/**
 * AnnouncementsCard (P3.8, P10.21): announcements render through
 * MarkdownBody, so lists keep their bullets, images never load and unsafe
 * links stay text; the "New" pips follow `announcementsSeenAt`, and the
 * seen island receives the newest `createdAt` on screen.
 */

import { render, screen, within } from '@testing-library/react'

import type { AnnouncementData } from '@/actions/announcements'
import { MarkAnnouncementsSeen } from '@/components/announcements/mark-announcements-seen'
import { AnnouncementsCard } from '@/components/dashboard/announcements-card'

jest.mock('@/components/announcements/mark-announcements-seen', () => ({
  MarkAnnouncementsSeen: jest.fn(() => null),
}))

function announcement(content: string, overrides: Partial<AnnouncementData> = {}): AnnouncementData {
  return {
    id: 'a1',
    title: 'Maintenance',
    content,
    priority: 0,
    isActive: true,
    createdAt: '2026-10-28T12:00:00.000Z',
    expiresAt: null,
    ...overrides,
  }
}

beforeEach(() => jest.clearAllMocks())

describe('AnnouncementsCard', () => {
  it('renders nothing without announcements', () => {
    const { container } = render(<AnnouncementsCard announcements={[]} seenAt={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders a bulleted list inside the typeset wrapper, with no clipped scroll box', () => {
    render(<AnnouncementsCard announcements={[announcement('Tonight:\n\n- Plex restarts\n- Disks swap')]} seenAt={null} />)

    const item = screen.getByTestId('announcement-a1')
    const typeset = item.querySelector('.typeset')
    expect(typeset).not.toBeNull()
    expect(within(item).getAllByRole('listitem')).toHaveLength(2)
    expect(typeset?.querySelector('ul > li')).toHaveTextContent('Plex restarts')
    expect(screen.getByTestId('announcements-card').querySelector('[class*="overflow-y"]')).toBeNull()
  })

  it('drops an image and keeps a javascript: link as text', () => {
    const { container } = render(
      <AnnouncementsCard
        announcements={[announcement('![x](https://attacker.example/?d=1) [click](javascript:alert(1))')]}
        seenAt={null}
      />
    )

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('click')).toBeInTheDocument()
    expect(screen.getByTestId('announcement-a1').querySelector('a')).toBeNull()
  })

  it('links to every announcement under an h2', () => {
    render(<AnnouncementsCard announcements={[announcement('Hi')]} seenAt={null} />)

    expect(screen.getByTestId('announcements-view-all')).toHaveAttribute('href', '/announcements')
    expect(screen.getByRole('heading', { level: 2, name: 'Announcements' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Maintenance' })).toBeInTheDocument()
  })

  it('pips only the announcements created after the seen date, and marks the newest as seen', () => {
    const older = announcement('Old', { id: 'old', createdAt: '2026-10-01T12:00:00.000Z' })
    const newer = announcement('New', { id: 'new', createdAt: '2026-10-20T12:00:00.000Z' })

    render(<AnnouncementsCard announcements={[older, newer]} seenAt={new Date('2026-10-10T00:00:00.000Z')} />)

    expect(screen.getByTestId('announcement-new-new')).toHaveTextContent('New')
    expect(screen.queryByTestId('announcement-old-new')).not.toBeInTheDocument()
    expect(jest.mocked(MarkAnnouncementsSeen).mock.calls.at(-1)?.[0]).toEqual({ through: '2026-10-20T12:00:00.000Z' })
  })

  it('pips every announcement for a member who has never looked', () => {
    render(<AnnouncementsCard announcements={[announcement('Hi')]} seenAt={null} />)

    expect(screen.getByTestId('announcement-a1-new')).toBeInTheDocument()
  })

  it('has no pinging or pulsing indicator', () => {
    const { container } = render(<AnnouncementsCard announcements={[announcement('Hi')]} seenAt={null} />)

    expect(container.querySelector('.animate-ping, .animate-pulse')).toBeNull()
  })
})
