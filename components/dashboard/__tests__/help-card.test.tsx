/**
 * Home's help card: the quality guide, a Report a problem row while problem
 * reports are on, and the support channel or Help's support section.
 */

import { render, screen } from '@testing-library/react'

import { HelpCard } from '@/components/dashboard/help-card'

describe('HelpCard', () => {
  it('links Report a problem to /report while problem reports are on', () => {
    render(<HelpCard supportChannelUrl={null} reportsEnabled />)

    expect(screen.getByTestId('home-help-report')).toHaveAttribute('href', '/report')
    expect(screen.queryByTestId('home-help-support')).not.toBeInTheDocument()
  })

  it('keeps the support channel beside the report row', () => {
    render(<HelpCard supportChannelUrl="https://discord.com/channels/g1/c1" reportsEnabled />)

    expect(screen.getByTestId('home-help-report')).toBeInTheDocument()
    expect(screen.getByTestId('home-help-support')).toHaveAttribute('href', 'https://discord.com/channels/g1/c1')
  })

  it("links Help's support section while problem reports are off", () => {
    render(<HelpCard supportChannelUrl={null} reportsEnabled={false} />)

    expect(screen.queryByTestId('home-help-report')).not.toBeInTheDocument()
    expect(screen.getByTestId('home-help-support')).toHaveAttribute('href', '/help#support')
  })
})
