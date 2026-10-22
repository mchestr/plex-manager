import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HistoricalWrappedSelectorHeader } from '@/components/admin/wrapped/historical-wrapped-selector-header'

const versions = [
  { id: 'usage-2', label: 'Oct 12, 2026, 2:26 PM CDT', detail: 'openai/gpt-5 · $0.02', isCurrent: true },
  { id: 'usage-1', label: 'Oct 10, 2026, 9:00 AM CDT', detail: 'openai/gpt-5 · $0.01', isCurrent: false },
]

const props = { wrappedId: 'wrapped-1', userId: 'user-1', year: 2025, selectedId: 'usage-1', versions }

describe('HistoricalWrappedSelectorHeader', () => {
  it('renders nothing without versions', () => {
    const { container } = render(<HistoricalWrappedSelectorHeader {...props} versions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the selected version and the count on its trigger', () => {
    render(<HistoricalWrappedSelectorHeader {...props} />)
    expect(screen.getByTestId('admin-wrapped-version-picker')).toHaveTextContent('Oct 10, 2026, 9:00 AM CDT(2)')
  })

  it('links the current version to the year preview and older ones to their history page', async () => {
    const user = userEvent.setup()
    render(<HistoricalWrappedSelectorHeader {...props} />)

    await user.click(screen.getByTestId('admin-wrapped-version-picker'))

    expect(await screen.findByTestId('admin-wrapped-version-usage-2')).toHaveAttribute('href', '/admin/users/user-1/rewind/2025')
    expect(screen.getByTestId('admin-wrapped-version-usage-2')).toHaveTextContent('(current)')
    expect(screen.getByTestId('admin-wrapped-version-usage-1')).toHaveAttribute('href', '/admin/wrapped/wrapped-1/history/usage-1')
  })
})
