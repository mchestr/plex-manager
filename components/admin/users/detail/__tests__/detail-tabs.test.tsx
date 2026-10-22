import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { replaceMock, resetUrl } from '@/__tests__/helpers/url-router'
import { DetailTabs } from '@/components/admin/users/detail/detail-tabs'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)

const TABS = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'rewind' as const, label: 'Rewind' },
  { value: 'usage' as const, label: 'Usage' },
]

describe('DetailTabs', () => {
  beforeEach(() => resetUrl('/admin/users/u1?tab=rewind'))

  it('selects the tab the URL names and shows its server-rendered panel', () => {
    render(
      <DetailTabs userId="u1" tabs={TABS} active="rewind">
        <p>Rewind panel</p>
      </DetailTabs>
    )

    expect(screen.getByRole('tab', { name: 'Rewind' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Rewind panel')
  })

  it('replaces the URL when a tab is clicked, leaving overview bare', async () => {
    const user = userEvent.setup()
    render(
      <DetailTabs userId="u1" tabs={TABS} active="rewind">
        <p>Rewind panel</p>
      </DetailTabs>
    )

    await user.click(screen.getByRole('tab', { name: 'Usage' }))
    expect(replaceMock).toHaveBeenLastCalledWith('/admin/users/u1?tab=usage', { scroll: false })

    await user.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(replaceMock).toHaveBeenLastCalledWith('/admin/users/u1', { scroll: false })
  })

  it('follows the arrow keys', async () => {
    const user = userEvent.setup()
    render(
      <DetailTabs userId="u1" tabs={TABS} active="rewind">
        <p>Rewind panel</p>
      </DetailTabs>
    )

    await user.click(screen.getByRole('tab', { name: 'Rewind' }))
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Usage' })).toHaveFocus()
    expect(replaceMock).toHaveBeenLastCalledWith('/admin/users/u1?tab=usage', { scroll: false })
  })
})
