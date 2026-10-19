import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

import { Time } from '@/components/ui/time'
import { FormatProvider } from '@/lib/format-context'

const SETTINGS = { timeZone: 'America/Los_Angeles', locale: 'en-US' }
const POSTED = '2026-10-19T11:55:00Z'

function renderTime(element = <Time value={POSTED} data-testid="posted-timestamp" />) {
  return <FormatProvider value={SETTINGS}>{element}</FormatProvider>
}

describe('Time', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-19T12:00:00Z') })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders the absolute time in the app zone on the server, with no title', () => {
    const html = renderToString(renderTime())

    expect(html).toContain('Oct 19, 2026, 4:55 AM')
    expect(html).toContain('dateTime="2026-10-19T11:55:00.000Z"')
    expect(html).not.toContain('title=')
  })

  it('turns relative after mount, with the viewer-local date in title', () => {
    render(renderTime())

    const time = screen.getByTestId('posted-timestamp')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveTextContent('5 minutes ago')
    expect(time).toHaveAttribute(
      'title',
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(POSTED))
    )
  })

  it('refreshes each minute', () => {
    render(renderTime())
    expect(screen.getByTestId('posted-timestamp')).toHaveTextContent('5 minutes ago')

    act(() => {
      jest.advanceTimersByTime(60_000)
    })

    expect(screen.getByTestId('posted-timestamp')).toHaveTextContent('6 minutes ago')
  })

  it('reads future times as relative too', () => {
    render(renderTime(<Time value={new Date('2026-10-19T14:00:00Z')} data-testid="next-run-timestamp" />))

    expect(screen.getByTestId('next-run-timestamp')).toHaveTextContent('in 2 hours')
  })
})
