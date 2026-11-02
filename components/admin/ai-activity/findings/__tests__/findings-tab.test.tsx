/**
 * The Findings tab (spec §2): the stat tiles, the type, severity and status
 * filters (status open by default), Hide unverified with the hidden count,
 * the List and Group by type and tool switch, and the empty state. Every
 * filter lives in the URL.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'

import { currentHref, resetUrl } from '@/__tests__/helpers/url-router'
import { findingRow } from '@/components/admin/ai-activity/findings/__tests__/findings-fixtures'
import { FindingsTab } from '@/components/admin/ai-activity/findings/findings-tab'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)

type Props = ComponentProps<typeof FindingsTab>

/** Opens a filter's Select. Base UI keeps its popup inert (`pointer-events: none`) until it is open, so a click can't come sooner. */
async function openFilter(user: ReturnType<typeof userEvent.setup>, testId: string) {
  const trigger = screen.getByTestId(testId)
  await user.click(trigger)
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))
}

const list: Props['view'] = {
  mode: 'list',
  rows: [findingRow({ id: 'f1' })],
  total: 1,
  hiddenUnverified: 4,
  hideUnverified: true,
  page: 1,
  pageSize: 25,
}

function renderTab(overrides: Partial<Props> = {}) {
  const props: Props = {
    stats: { open: 7, fixed: 2, falseAlarmRate: 0.25 },
    view: list,
    range: null,
    filtered: false,
    zone: 'UTC',
    ...overrides,
  }
  return render(<FindingsTab {...props} />)
}

beforeEach(() => resetUrl('/admin/ai?view=findings'))

describe('FindingsTab', () => {
  it('default filters status open and hide unverified', () => {
    renderTab()

    expect(screen.getByTestId('findings-filters-filter-status')).toHaveTextContent('Open')
    expect(screen.queryByTestId('findings-filters-chip-status')).not.toBeInTheDocument()
    const hide = screen.getByTestId('findings-hide-unverified')
    expect(hide).toHaveAttribute('aria-checked', 'true')
    expect(hide).toHaveAccessibleName('Hide unverified (4)')
    expect(screen.getByTestId('findings-table-row-f1')).toBeInTheDocument()
  })

  it('shows the stat tiles', () => {
    renderTab()
    expect(screen.getByTestId('findings-stat-open')).toHaveTextContent('Open7')
    expect(screen.getByTestId('findings-stat-fixed')).toHaveTextContent('Fixed (in range)2')
    expect(screen.getByTestId('findings-stat-false-alarm')).toHaveTextContent('False alarm rate25.0%')
  })

  it('false alarm tile shows "—" when null', () => {
    renderTab({ stats: { open: 0, fixed: 0, falseAlarmRate: null } })
    expect(screen.getByTestId('findings-stat-false-alarm')).toHaveTextContent('False alarm rate—')
  })

  it('writes the severity and status filters to the URL, back on page 1', async () => {
    resetUrl('/admin/ai?view=findings&page=2')
    const user = userEvent.setup()
    renderTab()

    await openFilter(user, 'findings-filters-filter-severity')
    await user.click(await screen.findByTestId('findings-filters-filter-severity-option-high'))
    expect(currentHref()).toBe('/admin/ai?view=findings&severity=high')

    await openFilter(user, 'findings-filters-filter-status')
    await user.click(await screen.findByTestId('findings-filters-filter-status-option-all'))
    expect(currentHref()).toBe('/admin/ai?view=findings&severity=high&status=all')
  })

  it('Hide unverified off shows them, through the URL', async () => {
    resetUrl('/admin/ai?view=findings&page=3')
    const user = userEvent.setup()
    const { rerender } = renderTab()

    await user.click(screen.getByTestId('findings-hide-unverified'))
    expect(currentHref()).toBe('/admin/ai?view=findings&unverified=show')

    rerender(
      <FindingsTab stats={{ open: 7, fixed: 2, falseAlarmRate: 0.25 }} view={{ ...list, hideUnverified: false }} range={null} filtered zone="UTC" />
    )
    await user.click(screen.getByTestId('findings-hide-unverified'))
    expect(currentHref()).toBe('/admin/ai?view=findings')
  })

  it('group toggle shows one row per type and tool, and a click filters the list', async () => {
    resetUrl('/admin/ai?view=findings&severity=high&from=2026-10-01&to=2026-10-31&page=2')
    const user = userEvent.setup()
    const { rerender } = renderTab()

    const toggle = screen.getByTestId('findings-group-toggle')
    await user.click(within(toggle).getByRole('radio', { name: 'Group by type and tool' }))
    expect(currentHref()).toBe('/admin/ai?view=findings&severity=high&from=2026-10-01&to=2026-10-31&group=type-tool')

    const latest = new Date('2026-10-20T12:00:00Z')
    rerender(
      <FindingsTab
        stats={{ open: 7, fixed: 2, falseAlarmRate: 0.25 }}
        view={{
          mode: 'groups',
          groups: [
            { type: 'wrong_tool', tool: 'get_users', open: 5, conversations: 3, latest },
            { type: 'misread_question', tool: null, open: 2, conversations: 2, latest },
          ],
        }}
        severity="high"
        range={{ from: '2026-10-01', to: '2026-10-31' }}
        filtered
        zone="UTC"
      />
    )

    const groups = screen.getByTestId('findings-groups')
    expect(within(groups).getAllByTestId(/^findings-groups-row-/)).toHaveLength(2)
    const first = screen.getByTestId('findings-groups-row-wrong_tool-get_users')
    expect(first).toHaveTextContent('Wrong tool')
    expect(first).toHaveTextContent('get_users')
    expect(within(first).getByTestId('findings-group-open-wrong_tool-get_users')).toHaveTextContent('5')
    expect(within(first).getByTestId('findings-group-conversations-wrong_tool-get_users')).toHaveTextContent('3')
    expect(screen.getByTestId('findings-groups-link-wrong_tool-get_users')).toHaveAttribute(
      'href',
      '/admin/ai?view=findings&type=wrong_tool&severity=high&tool=get_users&from=2026-10-01&to=2026-10-31'
    )
    expect(screen.getByTestId('findings-groups-link-misread_question-none')).toHaveAttribute(
      'href',
      '/admin/ai?view=findings&type=misread_question&severity=high&tool=&from=2026-10-01&to=2026-10-31'
    )
    // Groups count open findings, so the status filter and Hide unverified are not offered
    expect(screen.queryByTestId('findings-filters-filter-status')).not.toBeInTheDocument()
    expect(screen.queryByTestId('findings-hide-unverified')).not.toBeInTheDocument()

    await user.click(within(screen.getByTestId('findings-group-toggle')).getByRole('radio', { name: 'List' }))
    expect(currentHref()).toBe('/admin/ai?view=findings&severity=high&from=2026-10-01&to=2026-10-31')
  })

  it("shows a group's tool as a filter chip that clears", async () => {
    resetUrl('/admin/ai?view=findings&type=wrong_tool&tool=get_users')
    const user = userEvent.setup()
    const { unmount } = renderTab({ filtered: true })
    expect(screen.getByTestId('findings-filters-chip-tool')).toHaveTextContent('Tool: get_users')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(currentHref()).toBe('/admin/ai?view=findings')
    unmount()

    resetUrl('/admin/ai?view=findings&type=misread_question&tool=')
    renderTab({ filtered: true })
    expect(screen.getByTestId('findings-filters-chip-tool')).toHaveTextContent('Tool: No tool')
  })

  it('Findings tab shows the empty state when no finding matches', () => {
    const { rerender } = renderTab({ view: { ...list, rows: [], total: 0, hiddenUnverified: 0 }, filtered: true })
    expect(screen.getByTestId('findings-empty')).toHaveTextContent('No findings match these filters')

    rerender(<FindingsTab stats={{ open: 0, fixed: 0, falseAlarmRate: null }} view={{ ...list, rows: [], total: 0 }} range={null} filtered={false} zone="UTC" />)
    expect(screen.getByTestId('findings-empty')).toHaveTextContent('No open findings')

    rerender(<FindingsTab stats={{ open: 0, fixed: 0, falseAlarmRate: null }} view={{ mode: 'groups', groups: [] }} range={null} filtered={false} zone="UTC" />)
    expect(screen.getByTestId('findings-empty')).toHaveTextContent('No open findings')
  })
})
