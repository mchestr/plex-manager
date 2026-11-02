/**
 * One judge finding (spec §2, "Conversation page"): its type, severity,
 * claim, evidence, suggestion and tool as plain text, then the message it
 * points at, clamped to 6 lines with a toggle.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { reviewFinding } from '@/components/admin/ai-activity/review/__tests__/review-fixtures'
import { FindingCard } from '@/components/admin/ai-activity/review/finding-card'

jest.mock('@/actions/admin/conversation-review', () => ({ setFindingStatus: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showError: jest.fn(), showSuccess: jest.fn() }) }))

describe('FindingCard', () => {
  it('shows the type, severity, claim, evidence, suggestion and tool', () => {
    render(<FindingCard finding={reviewFinding({ id: 'f1' })} />)

    const card = screen.getByTestId('finding-card-f1')
    expect(card).toHaveTextContent('Wrong fact')
    expect(card).toHaveTextContent('Medium severity')
    expect(card).toHaveTextContent('The answer says the server has 12 libraries.')
    expect(card).toHaveTextContent('get_libraries returned 9 libraries.')
    expect(card).toHaveTextContent('Count the libraries the tool returned.')
    expect(card).toHaveTextContent('get_libraries')
  })

  it('renders claim text as plain text', () => {
    const claim = 'See <a href="https://evil.example">this</a> and **bold**'
    const { container } = render(<FindingCard finding={reviewFinding({ id: 'f1', claim, suggestion: '[click](https://evil.example)' })} />)

    expect(screen.getByText(claim)).toBeInTheDocument()
    expect(screen.getByText('[click](https://evil.example)')).toBeInTheDocument()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('strong')).toBeNull()
  })

  it('finding card shows "Message #N (Role)" and the stored message as plain text clamped to 6 lines, and finding-message-toggle-<id> shows it in full', async () => {
    const user = userEvent.setup()
    const content = 'Line one\n**not bold**\n<a href="https://evil.example">x</a>\nfour\nfive\nsix\nseven'
    render(<FindingCard finding={reviewFinding({ id: 'f1', message: { index: 7, role: 'assistant', content } })} />)

    // The role in parentheses: the design system bans middots in copy
    expect(screen.getByText('Message #7 (Assistant)')).toBeInTheDocument()
    const text = screen.getByTestId('finding-message-f1')
    expect(text.textContent).toBe(content)
    expect(text).toHaveClass('line-clamp-6')
    expect(text.querySelector('a, strong')).toBeNull()

    const toggle = screen.getByTestId('finding-message-toggle-f1')
    expect(toggle).toHaveTextContent('Show full message')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)

    expect(text).not.toHaveClass('line-clamp-6')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveTextContent('Show less')
  })

  it('labels a user message', () => {
    render(<FindingCard finding={reviewFinding({ id: 'f1', message: { index: 0, role: 'user', content: 'How many?' } })} />)

    expect(screen.getByText('Message #0 (User)')).toBeInTheDocument()
  })

  it('is the target of a finding-<id> link, below the sticky header, and its triage controls name it', () => {
    render(<FindingCard finding={reviewFinding({ id: 'f1' })} />)

    const card = screen.getByTestId('finding-card-f1')
    expect(card).toHaveAttribute('id', 'finding-f1')
    expect(card).toHaveClass('scroll-mt-24')
    // Focus can follow the link to it, while the card stays out of the tab order
    expect(card).toHaveAttribute('tabindex', '-1')
    const title = screen.getByRole('heading', { name: 'Wrong fact' })
    expect(title).toHaveAttribute('id', 'finding-title-f1')
    expect(screen.getByText('Message #3 (Assistant)')).toHaveAttribute('id', 'finding-message-label-f1')
    for (const testId of ['finding-status-select-f1', 'finding-note-f1', 'finding-note-save-f1']) {
      expect(screen.getByTestId(testId)).toHaveAttribute('aria-describedby', 'finding-title-f1 finding-message-label-f1')
    }
  })

  it('shows the focus ring while a link has focused it', () => {
    render(<FindingCard finding={reviewFinding({ id: 'f1' })} />)

    const card = screen.getByTestId('finding-card-f1')
    // The ring tokens the app's focusable cards use, on :focus-visible only, so a click inside the card shows none
    expect(card).toHaveClass('focus-visible:outline-2', 'focus-visible:outline-offset-2', 'focus-visible:outline-ring')
    expect(card).not.toHaveClass('outline-none')
  })

  it('tells apart the triage controls of two findings of the same type by the message each points at', () => {
    render(
      <>
        <FindingCard finding={reviewFinding({ id: 'f1', message: { index: 3, role: 'assistant', content: 'You have 12 libraries.' } })} />
        <FindingCard finding={reviewFinding({ id: 'f2', message: { index: 7, role: 'assistant', content: 'You have 4 users.' } })} />
      </>
    )

    for (const [id, description] of [
      ['f1', 'Wrong fact Message #3 (Assistant)'],
      ['f2', 'Wrong fact Message #7 (Assistant)'],
    ]) {
      for (const testId of [`finding-status-select-${id}`, `finding-note-${id}`, `finding-note-save-${id}`]) {
        expect(screen.getByTestId(testId)).toHaveAccessibleDescription(description)
      }
    }
  })

  it('a not_applicable finding reads "No quote needed"', () => {
    render(
      <FindingCard
        finding={reviewFinding({ id: 'f1', type: 'misread_question', evidenceCheck: 'not_applicable', evidenceSource: 'none', evidence: '', tool: null })}
      />
    )

    expect(screen.getByTestId('finding-card-f1')).toHaveTextContent('No quote needed')
    expect(screen.getByTestId('finding-card-f1')).toHaveTextContent('Misread question')
  })

  it('marks an unverified quote, and only an unverified one', () => {
    const { unmount } = render(<FindingCard finding={reviewFinding({ id: 'f1', evidenceCheck: 'unverified' })} />)
    expect(screen.getByTestId('finding-unverified-f1')).toHaveTextContent('Unverified quote')
    unmount()

    render(<FindingCard finding={reviewFinding({ id: 'f1', evidenceCheck: 'verified' })} />)
    expect(screen.queryByTestId('finding-unverified-f1')).not.toBeInTheDocument()
  })
})
