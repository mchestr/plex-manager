/**
 * Triage on a finding card: the status Select saves at once and the note
 * saves through its own button, both through `setFindingStatus`, with the
 * action's error in a toast.
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setFindingStatus } from '@/actions/admin/conversation-review'
import { FindingTriage } from '@/components/admin/ai-activity/review/finding-triage'

jest.mock('@/actions/admin/conversation-review', () => ({ setFindingStatus: jest.fn() }))

const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showError: mockShowError, showSuccess: jest.fn() }) }))

const save = jest.mocked(setFindingStatus)

beforeEach(() => jest.clearAllMocks())

/** Opens the status Select. Base UI keeps its popup inert (`pointer-events: none`) until it is open, so a click can't come sooner. */
async function openStatus(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByTestId('finding-status-select-f1')
  await user.click(trigger)
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))
}

describe('FindingTriage', () => {
  it('shows the stored status and note', () => {
    render(<FindingTriage findingId="f1" describedBy="finding-title-f1" status="wont_fix" note="Known gap" />)

    expect(screen.getByTestId('finding-status-select-f1')).toHaveTextContent("Won't fix")
    expect(screen.getByTestId('finding-note-f1')).toHaveValue('Known gap')
  })

  it.each([
    ['fixed', 'Fixed'],
    ['wont_fix', "Won't fix"],
    ['false_alarm', 'False alarm'],
  ] as const)('choosing finding-status-option-<status> saves at once through setFindingStatus (%s)', async (value, label) => {
    const user = userEvent.setup()
    save.mockResolvedValue({ success: true, data: null })
    render(<FindingTriage findingId="f1" describedBy="finding-title-f1" status="open" note={null} />)

    await openStatus(user)
    await user.click(await screen.findByTestId(`finding-status-option-${value}`))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ findingId: 'f1', status: value })
    expect(screen.getByTestId('finding-status-select-f1')).toHaveTextContent(label)
  })

  it('finding-note-save-<id> saves the note', async () => {
    const user = userEvent.setup()
    save.mockResolvedValue({ success: true, data: null })
    render(<FindingTriage findingId="f1" describedBy="finding-title-f1" status="fixed" note={null} />)

    await user.type(screen.getByTestId('finding-note-f1'), 'Prompt now counts libraries')
    expect(save).not.toHaveBeenCalled()
    await user.click(screen.getByTestId('finding-note-save-f1'))

    // A note-only save sends no status, so the finding keeps who triaged it and when
    expect(save).toHaveBeenCalledWith({ findingId: 'f1', note: 'Prompt now counts libraries' })
  })

  it('a saved note shows as saved, trimmed, and a refreshed status and note replace the local ones', async () => {
    const user = userEvent.setup()
    save.mockResolvedValue({ success: true, data: null })
    const { rerender } = render(<FindingTriage findingId="f1" describedBy="finding-title-f1" status="open" note={null} />)

    await user.type(screen.getByTestId('finding-note-f1'), '  Counted by hand  ')
    await user.click(screen.getByTestId('finding-note-save-f1'))
    expect(save).toHaveBeenCalledWith({ findingId: 'f1', note: 'Counted by hand' })
    await waitFor(() => expect(screen.getByTestId('finding-note-f1')).toHaveValue('Counted by hand'))

    // Another admin closed it; the page refresh brings the stored status and note
    rerender(<FindingTriage findingId="f1" describedBy="finding-title-f1" status="false_alarm" note="Not a bug" />)
    expect(screen.getByTestId('finding-status-select-f1')).toHaveTextContent('False alarm')
    expect(screen.getByTestId('finding-note-f1')).toHaveValue('Not a bug')
  })

  it('keeps the Select enabled and focused while its save runs', async () => {
    const user = userEvent.setup()
    let settle: (value: { success: true; data: null }) => void = () => {}
    save.mockReturnValue(new Promise((resolve) => (settle = resolve)))
    render(<FindingTriage findingId="f1" describedBy="finding-title-f1" status="open" note={null} />)

    const trigger = screen.getByTestId('finding-status-select-f1')
    await openStatus(user)
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(save).toHaveBeenCalledWith({ findingId: 'f1', status: 'fixed' }))

    // The save is still running
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(trigger).not.toBeDisabled()
    expect(trigger).not.toHaveAttribute('data-disabled')

    await act(async () => settle({ success: true, data: null }))
    expect(trigger).toHaveFocus()
  })

  it('ties the Select, the note and Save note to the card title', () => {
    render(<FindingTriage findingId="f1" describedBy="finding-title-f1" status="open" note={null} />)

    expect(screen.getByTestId('finding-status-select-f1')).toHaveAttribute('aria-describedby', 'finding-title-f1')
    expect(screen.getByTestId('finding-note-f1')).toHaveAttribute('aria-describedby', 'finding-title-f1')
    expect(screen.getByTestId('finding-note-save-f1')).toHaveAttribute('aria-describedby', 'finding-title-f1')
  })

  it('triage calls setFindingStatus and shows the error toast on failure', async () => {
    const user = userEvent.setup()
    save.mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'Finding not found.' })
    render(<FindingTriage findingId="f1" describedBy="finding-title-f1" status="open" note={null} />)

    await openStatus(user)
    await user.click(await screen.findByTestId('finding-status-option-fixed'))

    expect(save).toHaveBeenCalledWith({ findingId: 'f1', status: 'fixed' })
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Finding not found.'))
    // The Select goes back to the stored status
    expect(screen.getByTestId('finding-status-select-f1')).toHaveTextContent('Open')

    await user.click(screen.getByTestId('finding-note-save-f1'))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledTimes(2))
  })
})
