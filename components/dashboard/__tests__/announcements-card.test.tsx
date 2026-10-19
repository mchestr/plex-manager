/**
 * AnnouncementsCard (P3.8): announcements render through MarkdownBody, so
 * lists keep their bullets, images never load and unsafe links stay text.
 */

import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { AnnouncementData } from '@/actions/announcements'
import { AnnouncementsCard } from '@/components/dashboard/announcements-card'

// jest.setup's motion mock has no `article`; render plain elements here.
jest.mock('motion/react', () => {
  const element =
    (Tag: 'div' | 'article') =>
    ({ children, 'data-testid': testId }: { children?: ReactNode; 'data-testid'?: string }) => (
      <Tag data-testid={testId}>{children}</Tag>
    )
  return {
    motion: { div: element('div'), article: element('article') },
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    useReducedMotion: () => true,
  }
})

const NOW = '2026-10-29T12:00:00.000Z'

function announcement(content: string): AnnouncementData {
  return {
    id: 'a1',
    title: 'Maintenance',
    content,
    priority: 0,
    isActive: true,
    createdAt: '2026-10-28T12:00:00.000Z',
    expiresAt: null,
  }
}

describe('AnnouncementsCard', () => {
  it('renders nothing without announcements', () => {
    const { container } = render(<AnnouncementsCard announcements={[]} now={NOW} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders a bulleted list inside the typeset wrapper', () => {
    render(<AnnouncementsCard announcements={[announcement('Tonight:\n\n- Plex restarts\n- Disks swap')]} now={NOW} />)

    const item = screen.getByTestId('announcement-a1')
    const typeset = item.querySelector('.typeset')
    expect(typeset).not.toBeNull()
    expect(within(item).getAllByRole('listitem')).toHaveLength(2)
    expect(typeset?.querySelector('ul > li')).toHaveTextContent('Plex restarts')
  })

  it('drops an image and keeps a javascript: link as text', () => {
    const { container } = render(
      <AnnouncementsCard
        announcements={[announcement('![x](https://attacker.example/?d=1) [click](javascript:alert(1))')]}
        now={NOW}
      />
    )

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('click')).toBeInTheDocument()
    expect(container.querySelector('a')).toBeNull()
  })
})
