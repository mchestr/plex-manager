/**
 * Your reports: status, the latest step in words, and Cancel behind a
 * confirm for the member's own untouched reports only.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { cancelProblemReport } from '@/actions/problem-reports'
import { ReportList } from '@/components/problem-reports/report-list'
import type { ReportRow } from '@/lib/member/problem-reports'

jest.mock('@/actions/problem-reports', () => ({ cancelProblemReport: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const ROWS: ReportRow[] = [
  { id: 'own', title: 'Heat (1995)', problem: "Won't start", status: 'WITH_ADMIN', latest: { words: 'You sent it', at: '2026-11-09T15:00:00.000Z' }, canCancel: true },
  { id: 'followed', title: 'Up (2009)', problem: 'Buffers a lot', status: 'WITH_ADMIN', latest: { words: "You're following it", at: '2026-11-08T15:00:00.000Z' }, canCancel: false },
  { id: 'closed', title: 'Alien (1979)', problem: 'Blurry or low quality', status: 'CLOSED', latest: { words: 'You cancelled it', at: '2026-11-07T15:00:00.000Z' }, canCancel: false },
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

  it('says when there are no reports', () => {
    render(<ReportList rows={[]} />)

    expect(screen.getByTestId('report-list-empty')).toHaveTextContent("You haven't reported a problem yet.")
  })
})
