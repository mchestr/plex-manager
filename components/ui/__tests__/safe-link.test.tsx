/**
 * SafeLink (P3.8, SEC-57): only http and https become links, same-origin links
 * render plainly and external links show where they go.
 */

import { render, screen } from '@testing-library/react'
import { SafeLink } from '@/components/ui/safe-link'

const APP_URL = 'https://plex.example.com'
const original = process.env.NEXT_PUBLIC_APP_URL

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = APP_URL
})
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = original
})

describe('SafeLink', () => {
  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    [' javascript:alert(1)'],
    ['java\tscript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:msgbox(1)'],
    ['file:///etc/passwd'],
    ['ftp://example.com/file'],
    ['mailto:someone@example.com'],
    ['https://user:pass@example.com/'],
  ])('renders %j as plain text with no href', (href) => {
    const { container } = render(<SafeLink href={href}>Label</SafeLink>)

    expect(screen.getByText('Label').tagName).toBe('SPAN')
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[href]')).toBeNull()
  })

  it('renders plain text when there is no href', () => {
    const { container } = render(<SafeLink>Label</SafeLink>)

    expect(container.querySelector('a')).toBeNull()
  })

  it.each([
    ['/help', '/help'],
    ['help?x=1#top', '/help?x=1#top'],
    [`${APP_URL}/admin/users`, '/admin/users'],
  ])('renders the same-origin link %j as a plain link to %j', (href, expected) => {
    render(<SafeLink href={href}>Label</SafeLink>)

    const link = screen.getByRole('link', { name: 'Label' })
    expect(link).toHaveAttribute('href', expected)
    expect(link).not.toHaveAttribute('target')
    expect(link).not.toHaveAttribute('rel')
    expect(link).toHaveTextContent(/^Label$/)
  })

  it.each([['https://example.com/a?b=1'], ['http://example.com/']])(
    'opens the external link %j in a new tab and shows its destination',
    (href) => {
      const { container } = render(<SafeLink href={href}>Label</SafeLink>)

      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveTextContent(`Label(${href})`)
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
  )

  it('does not repeat the destination when the label is the URL', () => {
    render(<SafeLink href="https://example.com/x">https://example.com/x</SafeLink>)

    expect(screen.getByRole('link')).toHaveTextContent(/^https:\/\/example\.com\/x$/)
  })

  it('ignores a caller target and rel on an external link', () => {
    render(
      <SafeLink href="https://example.com/" target="_self" rel="opener">
        Label
      </SafeLink>
    )

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('treats every absolute link as external when NEXT_PUBLIC_APP_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    render(<SafeLink href={`${APP_URL}/x`}>Label</SafeLink>)

    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank')
  })
})
