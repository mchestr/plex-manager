/**
 * The /announcements page (P10.22, UI-25): every active announcement with
 * real Markdown, "New" pips from `User.announcementsSeenAt`, and the empty state.
 */

import { render, screen, within } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getActiveAnnouncements, type AnnouncementData } from '@/actions/announcements'
import AnnouncementsPage from '@/app/(app)/announcements/page'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
jest.mock('@/actions/announcements', () => ({ getActiveAnnouncements: jest.fn() }))
const seen: Array<string | null> = []
jest.mock('@/components/announcements/mark-announcements-seen', () => ({
  MarkAnnouncementsSeen: ({ through }: { through: string | null }) => {
    seen.push(through)
    return null
  },
}))

const announcement = (id: string, createdAt: string, content = 'Body'): AnnouncementData => ({
  id,
  title: `Title ${id}`,
  content,
  priority: 0,
  isActive: true,
  createdAt,
  expiresAt: null,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  seen.length = 0
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1' } })
})

describe('AnnouncementsPage', () => {
  it('renders each announcement as an article with an h2 and real list bullets', async () => {
    jest.mocked(getActiveAnnouncements).mockResolvedValue({
      success: true,
      data: [announcement('a1', '2026-11-02T12:00:00.000Z', '- Faster streams\n- New 4K library')],
    })
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ announcementsSeenAt: null }))

    render(await AnnouncementsPage())

    expect(screen.getByRole('heading', { level: 1, name: 'Announcements' })).toBeInTheDocument()
    const article = screen.getByRole('article', { name: 'Title a1' })
    expect(within(article).getByRole('heading', { level: 2, name: 'Title a1' })).toBeInTheDocument()
    expect(within(article).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Faster streams',
      'New 4K library',
    ])
  })

  it('pips only the announcements posted after the seen date, and marks the newest as seen', async () => {
    jest.mocked(getActiveAnnouncements).mockResolvedValue({
      success: true,
      data: [announcement('old', '2026-10-01T12:00:00.000Z'), announcement('new', '2026-11-02T12:00:00.000Z')],
    })
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ announcementsSeenAt: new Date('2026-10-15T00:00:00Z') }))

    render(await AnnouncementsPage())

    expect(screen.getByTestId('announcement-new-new')).toHaveTextContent('New')
    expect(screen.queryByTestId('announcement-old-new')).not.toBeInTheDocument()
    expect(seen).toEqual(['2026-11-02T12:00:00.000Z'])
  })

  it('shows the first-use empty state with no announcements', async () => {
    jest.mocked(getActiveAnnouncements).mockResolvedValue({ success: true, data: [] })
    prismaMock.user.findUnique.mockResolvedValue(buildUser())

    render(await AnnouncementsPage())

    expect(screen.getByTestId('announcements-empty')).toHaveTextContent('No announcements yet')
    expect(screen.getByTestId('announcements-empty')).toHaveAttribute('data-kind', 'first-use')
    expect(seen).toEqual([null])
  })
})
