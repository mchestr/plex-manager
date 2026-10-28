/**
 * RewindStatusPanel (P5.1, ui-design-system 5.5): every kind prints on paper
 * with copy looked up from a code, Close and Back, and never a stored message.
 */

import { render, screen } from '@testing-library/react'

import { RewindStatusPanel } from '@/components/rewind/rewind-status-panel'
import type { RewindStatusKind } from '@/lib/rewind/year-view'
import { errorCopy, type RewindPanelCode } from '@/lib/ui/error-copy'
import type { RewindErrorCode } from '@/lib/wrapped/generation-errors'

jest.mock('@/components/rewind/rewind-generating-watch', () => ({
  RewindGeneratingWatch: ({ year }: { year: number }) => <p data-testid="generating-watch">{year}</p>,
}))

const CASES: Array<[RewindStatusKind, RewindPanelCode | RewindErrorCode]> = [
  ['generating', 'REWIND_GENERATING'],
  ['failed', 'TIMEOUT'],
  ['parse-error', 'REWIND_UNREADABLE'],
  ['not-found', 'REWIND_NOT_FOUND'],
  ['not-found', 'REWIND_NOT_MADE'],
  ['unavailable', 'REDIS_UNAVAILABLE'],
  ['unavailable', 'REWIND_NOT_OPEN'],
  ['not-eligible', 'REWIND_NOT_ELIGIBLE'],
]

describe('RewindStatusPanel', () => {
  it.each(CASES)('prints %s (%s) on paper with the copy for its code', (kind, code) => {
    render(<RewindStatusPanel kind={kind} code={code} year={2026} returnTo="/account" audience="member" />)

    const copy = errorCopy(code, { audience: 'member' })
    const panel = screen.getByTestId('rewind-status-panel')
    expect(panel).toHaveAttribute('data-field', 'paper')
    expect(panel).toHaveAttribute('data-kind', kind)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.title)
    expect(screen.getByTestId('rewind-status-message')).toHaveTextContent(copy.description)
    expect(copy.title).not.toBe(errorCopy('unknown', { audience: 'member' }).title)
    expect(screen.getByTestId('rewind-close')).toHaveAttribute('href', '/account')
    expect(screen.getByTestId('rewind-status-back')).toHaveAttribute('href', '/account')
  })

  it('renders generic copy, not the text, for anything that is not a code', () => {
    const stored = 'connect ECONNREFUSED 10.0.0.5:8181 for mona.private@example.com'
    render(
      <RewindStatusPanel
        kind="failed"
        code={stored as RewindErrorCode}
        year={2026}
        returnTo="/"
        audience="admin"
      />
    )

    expect(document.body).not.toHaveTextContent('ECONNREFUSED')
    expect(document.body).not.toHaveTextContent('mona')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong on the server')
  })

  it('polls only while generating', () => {
    const { rerender } = render(
      <RewindStatusPanel kind="generating" code="REWIND_GENERATING" year={2026} returnTo="/" audience="member" />
    )
    expect(screen.getByTestId('generating-watch')).toHaveTextContent('2026')

    rerender(<RewindStatusPanel kind="failed" code="TIMEOUT" year={2026} returnTo="/" audience="member" />)
    expect(screen.queryByTestId('generating-watch')).not.toBeInTheDocument()
  })

  it('links not-found to the other completed years, not the one on screen', () => {
    render(
      <RewindStatusPanel
        kind="not-found"
        code="REWIND_NOT_FOUND"
        year={2025}
        returnTo="/"
        audience="member"
        completedYears={[2026, 2025, 2024]}
      />
    )

    const links = screen.getByTestId('rewind-year-links')
    expect(links.querySelectorAll('a')).toHaveLength(2)
    expect(screen.getByTestId('rewind-year-link-2026')).toHaveAttribute('href', '/rewind/2026')
    expect(screen.queryByTestId('rewind-year-link-2025')).not.toBeInTheDocument()
  })

  it('has no year links without other years', () => {
    render(<RewindStatusPanel kind="not-found" code="REWIND_NOT_FOUND" year={null} returnTo="/" audience="member" />)

    expect(screen.queryByTestId('rewind-year-links')).not.toBeInTheDocument()
    expect(screen.getByText('Rewind')).toBeInTheDocument()
  })
})
