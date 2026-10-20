/**
 * RequestsCard (P3.8, SEC-57): the admin-set Overseerr URL becomes a link only
 * when it is http or https.
 */

import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { RequestsCard } from '@/components/dashboard/requests-card'

// jest.setup's motion mock has no `a`; keep only the DOM attributes.
jest.mock('motion/react', () => ({
  motion: {
    a: ({ href, target, rel, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { 'data-testid'?: string }) => (
      <a href={href} target={target} rel={rel} data-testid={props['data-testid']}>
        {children}
      </a>
    ),
  },
}))

describe('RequestsCard', () => {
  it('links an https URL in a new tab', () => {
    render(<RequestsCard url="https://requests.example.com" />)

    const card = screen.getByTestId('requests-card')
    expect(card).toHaveAttribute('href', 'https://requests.example.com/')
    expect(card).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it.each(['javascript:alert(1)', 'data:text/html,hi'])('renders nothing for %s', (url) => {
    const { container } = render(<RequestsCard url={url} />)

    expect(container).toBeEmptyDOMElement()
  })
})
