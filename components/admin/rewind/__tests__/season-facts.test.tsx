/**
 * The Season page's facts panel: the season's dates, model, schedule and
 * flags, read only, with a link to Rewind settings where they are edited.
 */

import { render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'

import { SeasonFacts, type SeasonFactsProps } from '@/components/admin/rewind/season-facts'

expect.extend(toHaveNoViolations)

// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock('next/link', () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<'a'>) => <a href={href} {...props} />
  return MockLink
})

const props: SeasonFactsProps = {
  opens: '1 December 2026',
  closes: '31 January 2027',
  dataWindow: "1 January to 30 November 2026, in each member's zone",
  model: 'gpt-5-mini',
  promptVersion: 'rewind-2026.1',
  freeze: 'Frozen 1 December 2026',
  audienceSwitch: 'By hand in Settings',
  prepareRuns: '02:15 in America/Chicago on 1 December 2026',
  dataPreparedAt: 'Not yet',
  flags: [
    { label: 'Rewind', value: 'On' },
    { label: 'Audience', value: 'Admins' },
  ],
}

describe('SeasonFacts', () => {
  it('lists the season under its heading, with the schedule and flags, and no axe violations', async () => {
    const { container } = render(<SeasonFacts {...props} />)

    const panel = screen.getByRole('region', { name: 'Season' })
    expect(panel).toBe(screen.getByTestId('admin-rewind-season-facts'))
    expect(within(panel).getByText('Opens').nextElementSibling).toHaveTextContent('1 December 2026')
    expect(within(panel).getByText('Closes').nextElementSibling).toHaveTextContent('31 January 2027')
    expect(screen.getByTestId('admin-rewind-freeze')).toHaveTextContent('Frozen 1 December 2026')
    expect(screen.getByTestId('admin-rewind-prepare-schedule')).toHaveTextContent('02:15 in America/Chicago on 1 December 2026')
    expect(screen.getByTestId('admin-rewind-audience-switch')).toHaveTextContent('By hand in Settings')
    expect(within(panel).getByText('Audience').nextElementSibling).toHaveTextContent('Admins')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('links to Rewind settings, where the facts are edited', () => {
    render(<SeasonFacts {...props} />)

    const link = screen.getByRole('link', { name: 'Edit in Rewind settings' })
    expect(link).toBe(screen.getByTestId('admin-rewind-season-settings-link'))
    expect(link).toHaveAttribute('href', '/admin/rewind/settings')
    expect(within(screen.getByTestId('admin-rewind-season-facts')).getByRole('link')).toBe(link)
  })
})
