/**
 * Your reports: status, the latest step in words, and Cancel behind a
 * confirm for the member's own untouched reports only.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { answerDoesItPlay, askServerAdmin, cancelProblemReport } from '@/actions/problem-reports'
import { ReportList } from '@/components/problem-reports/report-list'
import type { ReportRow } from '@/lib/member/your-reports'

jest.mock('@/actions/problem-reports', () => ({ cancelProblemReport: jest.fn(), askServerAdmin: jest.fn(), answerDoesItPlay: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const ROWS: ReportRow[] = [
  { id: 'own', title: 'Heat (1995)', problem: "Won't start", status: 'WITH_ADMIN', latest: { words: 'You sent it', at: '2026-11-09T15:00:00.000Z' }, canCancel: true, canAsk: false, askPlays: false, statusSub: null, note: null },
  { id: 'followed', title: 'Up (2009)', problem: 'Buffers a lot', status: 'WITH_ADMIN', latest: { words: "You're following it", at: '2026-11-08T15:00:00.000Z' }, canCancel: false, canAsk: false, askPlays: false, statusSub: null, note: null },
  { id: 'closed', title: 'Alien (1979)', problem: 'Blurry or low quality', status: 'CLOSED', latest: { words: 'You cancelled it', at: '2026-11-07T15:00:00.000Z' }, canCancel: false, canAsk: false, askPlays: false, statusSub: 'Cancelled', note: null },
  {
    id: 'none',
    title: 'Heat (1995)',
    problem: 'Blurry or low quality',
    status: 'CLOSED',
    latest: { words: "We looked, but there's no better copy right now", at: '2026-11-06T15:00:00.000Z' },
    canCancel: false,
    canAsk: true, askPlays: false,
    statusSub: 'No better copy right now',
    note: null,
  },
  {
    id: 'answered',
    title: 'Dune (2021)',
    problem: 'Looks filmed off a screen',
    status: 'CLOSED',
    latest: { words: 'The server admin closed it', at: '2026-11-06T15:00:00.000Z' },
    canCancel: false,
    canAsk: false, askPlays: false,
    statusSub: 'By the server admin',
    note: 'This is the only copy.\nA better one comes out in March.',
  },
]

beforeEach(() => jest.clearAllMocks())

describe('ReportList', () => {
  it('shows each report with its status and latest step', () => {
    render(<ReportList rows={ROWS} />)

    expect(screen.getByTestId('report-row-latest-own')).toHaveTextContent('You sent it Nov 9')
    expect(screen.getByTestId('report-row-status-own')).toHaveTextContent('With the server admin')
    expect(screen.getByTestId('report-row-status-closed')).toHaveTextContent('Closed')
    expect(screen.getByTestId('report-row-status-closed')).toHaveTextContent('Cancelled')
    expect(screen.queryByTestId('report-cancel-followed')).not.toBeInTheDocument()
    expect(screen.queryByTestId('report-cancel-closed')).not.toBeInTheDocument()
  })

  it("shows the server admin's note as plain text, with why it closed", () => {
    render(<ReportList rows={ROWS} />)

    const note = screen.getByTestId('report-row-note-answered')
    expect(note).toHaveTextContent(/^Note from the server admin/)
    expect(note).toHaveTextContent('This is the only copy. A better one comes out in March.')
    expect(screen.getByTestId('report-row-status-answered')).toHaveTextContent('By the server admin')
    expect(screen.queryByTestId('report-row-note-own')).not.toBeInTheDocument()
  })

  it('cancels an own report after a confirm', async () => {
    const user = userEvent.setup()
    jest.mocked(cancelProblemReport).mockResolvedValue({ success: true, data: null })
    render(<ReportList rows={ROWS} />)

    await user.click(screen.getByTestId('report-cancel-own'))
    expect(await screen.findByTestId('report-cancel-dialog')).toHaveTextContent('Cancel your report about Heat (1995)?')
    await user.click(screen.getByTestId('report-cancel-confirm'))

    expect(cancelProblemReport).toHaveBeenCalledWith({ reportId: 'own' })
    expect(mockShowSuccess).toHaveBeenCalledWith('Report cancelled')
  })

  it('asks the server admin about a report that found no better copy', async () => {
    const user = userEvent.setup()
    jest.mocked(askServerAdmin).mockResolvedValue({ success: true, data: null })
    render(<ReportList rows={ROWS} />)

    expect(screen.getByTestId('report-row-status-none')).toHaveTextContent('No better copy right now')
    expect(screen.queryByTestId('report-ask-own')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('report-ask-none'))

    expect(askServerAdmin).toHaveBeenCalledWith({ reportId: 'none' })
    expect(mockShowSuccess).toHaveBeenCalledWith('Sent to the server admin')
  })

  it("says why a report couldn't go to the server admin", async () => {
    const user = userEvent.setup()
    jest.mocked(askServerAdmin).mockResolvedValue({ success: false, code: 'NOT_FOUND', error: "This report can't go to the server admin now." })
    render(<ReportList rows={ROWS} />)

    await user.click(screen.getByTestId('report-ask-none'))

    expect(mockShowError).toHaveBeenCalledWith("This report can't go to the server admin now.")
  })

  it('asks whether a swapped copy plays, and records that it does', async () => {
    const user = userEvent.setup()
    jest.mocked(answerDoesItPlay).mockResolvedValue({ success: true, data: null })
    const swapped: ReportRow = { ...ROWS[0], id: 'swapped', status: 'FIXED', canCancel: false, askPlays: true }
    render(<ReportList rows={[swapped, ...ROWS]} />)

    expect(screen.getByTestId('report-plays-swapped')).toHaveTextContent('Does it play now?')
    expect(screen.queryByTestId('report-plays-own')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('report-plays-yes-swapped'))

    expect(answerDoesItPlay).toHaveBeenCalledWith({ reportId: 'swapped', plays: true, note: '' })
    expect(mockShowSuccess).toHaveBeenCalledWith('Thanks for letting us know')
  })

  it("sends a copy that's still broken to the server admin with what's still wrong", async () => {
    const user = userEvent.setup()
    jest.mocked(answerDoesItPlay).mockResolvedValue({ success: true, data: null })
    render(<ReportList rows={[{ ...ROWS[0], id: 'swapped', status: 'FIXED', canCancel: false, askPlays: true }]} />)

    await user.click(screen.getByTestId('report-plays-no-swapped'))
    expect(await screen.findByTestId('report-plays-dialog')).toHaveTextContent('Heat (1995) is still broken')
    await user.type(screen.getByTestId('report-plays-note'), 'Still no sound')
    await user.click(screen.getByTestId('report-plays-send'))

    expect(answerDoesItPlay).toHaveBeenCalledWith({ reportId: 'swapped', plays: false, note: 'Still no sound' })
    expect(mockShowSuccess).toHaveBeenCalledWith('Sent to the server admin')
  })

  it('says when there are no reports', () => {
    render(<ReportList rows={[]} />)

    expect(screen.getByTestId('report-list-empty')).toHaveTextContent("You haven't reported a problem yet.")
  })
})
