/**
 * The report sheet: step 1's rows, step 2's problem, episode and note, the
 * button named for what happens, Back, and "Already reported" with follow and
 * "It's something else". Choosing a radio never moves on by itself.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { currentHref, resetUrl } from '@/__tests__/helpers/url-router'
import { followProblemReport, reportProblem } from '@/actions/problem-reports'
import { ReportSheet } from '@/components/problem-reports/report-sheet'
import type { SelectedTitle } from '@/lib/member/problem-reports'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/problem-reports', () => ({ reportProblem: jest.fn(), followProblemReport: jest.fn() }))
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showError: mockShowError, showSuccess: jest.fn() }) }))

const MOVIE: SelectedTitle = { ratingKey: '555', type: 'movie', title: 'Heat (1995)', episodes: null, openReport: null, lastPlay: null }
const SHOW: SelectedTitle = {
  ratingKey: '6999',
  type: 'show',
  title: 'The Office (2005)',
  episodes: [{ ratingKey: '7001', label: 'S1E1: Pilot' }],
  openReport: null,
  lastPlay: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl('/report?q=heat&item=555')
})

describe('ReportSheet', () => {
  it('sends a problem to the server admin from the two steps', async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-1', joined: false } })
    render(<ReportSheet selected={MOVIE} closeHref="/report?q=heat" />)

    expect(screen.getByTestId('report-sheet-title')).toHaveTextContent('Heat (1995)')
    expect(screen.queryByTestId('report-kind-episodes')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('report-kind-playback'))

    expect(screen.getByTestId('report-step-heading')).toHaveFocus()
    expect(screen.getByTestId('report-send')).toBeDisabled()
    await user.click(within(screen.getByTestId('report-problem-out_of_sync')).getByText('Sound is out of sync'))
    expect(screen.getByTestId('report-step-heading')).toHaveTextContent("It won't play properly")
    await user.type(screen.getByTestId('report-note'), 'From the start')
    expect(screen.getByTestId('report-consequence')).toHaveTextContent('The server admin will take a look.')
    await user.click(screen.getByTestId('report-send'))

    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '555', problem: 'out_of_sync', note: 'From the start' })
    expect(await screen.findByTestId('report-sent')).toHaveTextContent('The server admin will take a look.')
    await user.click(screen.getByTestId('report-done'))
    expect(currentHref()).toBe('/report?q=heat')
  })

  it('needs a note for something else', async () => {
    const user = userEvent.setup()
    render(<ReportSheet selected={MOVIE} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-other'))

    expect(screen.queryByTestId('report-problems')).not.toBeInTheDocument()
    expect(screen.getByTestId('report-send')).toBeDisabled()
    await user.type(screen.getByTestId('report-note'), 'The menus are in French')
    expect(screen.getByTestId('report-send')).toBeEnabled()
  })

  it("reports a show's episode, and Back returns to step 1", async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-2', joined: true } })
    render(<ReportSheet selected={SHOW} closeHref="/report" />)

    expect(screen.getByTestId('report-kind-episodes')).toBeInTheDocument()
    await user.click(screen.getByTestId('report-kind-playback'))
    await user.click(screen.getByTestId('report-back'))
    expect(screen.getByTestId('report-step-heading')).toHaveTextContent("What's wrong?")

    await user.click(screen.getByTestId('report-kind-playback'))
    await user.click(within(screen.getByTestId('report-problem-wont_start')).getByText("Won't start"))
    await user.click(screen.getByTestId('report-episode-trigger'))
    await user.click(await screen.findByTestId('report-episode-option-7001'))
    await user.click(screen.getByTestId('report-send'))

    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '7001', problem: 'wont_start', note: '' })
    expect(await screen.findByTestId('report-sent')).toHaveTextContent('we added yours to it')
  })

  it("asks whether anything else plays on the member's player, and sends the answer", async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-3', joined: false } })
    render(<ReportSheet selected={{ ...MOVIE, lastPlay: { player: 'Living Room', transcoded: false, at: '2026-11-08T20:00:00.000Z' } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-playback'))
    await user.click(within(screen.getByTestId('report-problem-wont_start')).getByText("Won't start"))
    expect(screen.getByTestId('report-device')).toBeInTheDocument()
    expect(screen.getByText('Does anything else play on Living Room?')).toBeInTheDocument()
    await user.click(within(screen.getByTestId('report-device-nothing_plays')).getByText('No, nothing plays'))
    expect(screen.getByTestId('report-device-guide')).toHaveAttribute('href', '/help#playback')
    await user.click(screen.getByTestId('report-send'))

    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '555', problem: 'wont_start', note: '', device: 'nothing_plays' })
  })

  it('explains a converted play for a blurry picture, and asks nothing about the device', async () => {
    const user = userEvent.setup()
    render(<ReportSheet selected={{ ...MOVIE, lastPlay: { player: 'Phone', transcoded: true, at: '2026-11-08T20:00:00.000Z' } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-picture'))
    await user.click(within(screen.getByTestId('report-problem-blurry')).getByText('Blurry or low quality'))

    expect(screen.getByTestId('report-transcode-tip')).toHaveTextContent('Your Plex app converted this video while you watched')
    expect(screen.queryByTestId('report-device')).not.toBeInTheDocument()
  })

  it('shows a refusal and stays on the step', async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: false, code: 'RATE_LIMITED', error: "You've sent a lot of reports." })
    render(<ReportSheet selected={MOVIE} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-playback'))
    await user.click(within(screen.getByTestId('report-problem-buffers')).getByText('Buffers a lot'))
    await user.click(screen.getByTestId('report-send'))

    expect(mockShowError).toHaveBeenCalledWith("You've sent a lot of reports.")
    expect(screen.getByTestId('report-send')).toBeInTheDocument()
  })

  it('starts on Already reported, and follows the open report', async () => {
    const user = userEvent.setup()
    jest.mocked(followProblemReport).mockResolvedValue({ success: true, data: null })
    const selected = { ...MOVIE, openReport: { id: 'report-open', problem: 'Sound is out of sync', status: 'WITH_ADMIN' as const, since: '2026-11-06T15:00:00.000Z', yours: false } }
    render(<ReportSheet selected={selected} closeHref="/report" />)

    expect(screen.getByTestId('report-already-text')).toHaveTextContent(
      'This title already has an open report: Sound is out of sync. With the server admin since Nov 6.'
    )
    await user.click(screen.getByTestId('report-follow'))

    expect(followProblemReport).toHaveBeenCalledWith({ reportId: 'report-open' })
    expect(await screen.findByTestId('report-following')).toHaveTextContent("We'll message you when it's fixed.")
    await user.click(screen.getByTestId('report-something-else'))
    expect(screen.getByTestId('report-kind-playback')).toBeInTheDocument()
  })

  it('shows why a title cannot be reported', () => {
    render(<ReportSheet selected={{ error: "We couldn't find that title in your libraries." }} closeHref="/report" />)

    expect(screen.getByTestId('report-sheet-error')).toHaveTextContent("We couldn't find that title in your libraries.")
  })
})
