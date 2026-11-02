/**
 * The Findings list (spec §2): severity, type, the claim on one line as
 * plain text, tool, a link to the conversation, date, status and the Seen
 * count.
 */

import { render, screen, within } from '@testing-library/react'

import { resetUrl } from '@/__tests__/helpers/url-router'
import { findingRow } from '@/components/admin/ai-activity/findings/__tests__/findings-fixtures'
import { FindingsTable } from '@/components/admin/ai-activity/findings/findings-table'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)

beforeEach(() => resetUrl('/admin/ai?view=findings'))

function renderTable(rows = [findingRow()]) {
  return render(<FindingsTable rows={rows} total={rows.length} page={1} pageSize={25} toolbar={null} empty={<p data-testid="findings-empty">None</p>} />)
}

describe('FindingsTable', () => {
  it('findings table shows the Seen count and links the conversation', () => {
    renderTable([
      findingRow({ id: 'f1', conversationId: 'conv/1', seenCount: 3, severity: 'high', type: 'wrong_tool', tool: 'get_users', status: 'fixed' }),
      findingRow({ id: 'f2', tool: null }),
    ])

    const row = screen.getByTestId('findings-table-row-f1')
    expect(within(row).getByTestId('findings-seen-f1')).toHaveTextContent('3')
    expect(within(row).getByTestId('findings-conversation-f1')).toHaveAttribute('href', '/admin/ai/conversation/conv%2F1#finding-f1')
    expect(row).toHaveTextContent('High')
    expect(row).toHaveTextContent('Wrong tool')
    expect(row).toHaveTextContent('get_users')
    expect(row).toHaveTextContent('Fixed')
    expect(row).toHaveTextContent('The answer says the server has 12 libraries.')
    expect(screen.getByTestId('findings-table-row-f2')).toHaveTextContent('—')
  })

  it('renders the claim on one line as plain text', () => {
    renderTable([findingRow({ id: 'f1', claim: 'See <a href="https://x.test">this</a> and **bold**' })])

    const claim = screen.getByTestId('findings-claim-f1')
    expect(claim).toHaveTextContent('See <a href="https://x.test">this</a> and **bold**')
    expect(claim).toHaveClass('line-clamp-1')
    expect(within(claim).queryByRole('link')).not.toBeInTheDocument()
  })

  it('marks an unverified row with a warning "Unverified quote" badge, and only that row', () => {
    renderTable([findingRow({ id: 'f1', evidenceCheck: 'unverified' }), findingRow({ id: 'f2', evidenceCheck: 'verified' }), findingRow({ id: 'f3', evidenceCheck: 'not_applicable' })])

    const badge = screen.getByTestId('findings-unverified-f1')
    expect(badge).toHaveTextContent('Unverified quote')
    expect(badge).toHaveClass('text-warning')
    expect(within(screen.getByTestId('findings-table-row-f1')).getByTestId('findings-unverified-f1')).toBeInTheDocument()
    expect(screen.queryByTestId('findings-unverified-f2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('findings-unverified-f3')).not.toBeInTheDocument()
  })

  it('shows the empty node without rows', () => {
    renderTable([])
    expect(screen.getByTestId('findings-empty')).toBeInTheDocument()
  })
})
