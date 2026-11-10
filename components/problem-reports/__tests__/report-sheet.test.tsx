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

const MOVIE: SelectedTitle = {
  ratingKey: '555',
  type: 'movie',
  title: 'Heat (1995)',
  episodes: null,
  openReport: null,
  lastPlay: null,
  playedToEnd: null,
  fixers: { radarr: false, sonarr: false },
  swap: null,
  matchFixes: false,
}
const SHOW: SelectedTitle = {
  ratingKey: '6999',
  type: 'show',
  title: 'The Office (2005)',
  episodes: [{ ratingKey: '7001', label: 'S1E1: Pilot' }],
  openReport: null,
  lastPlay: null,
  playedToEnd: null,
  fixers: { radarr: false, sonarr: false },
  swap: null,
  matchFixes: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl('/report?q=heat&item=555')
})

describe('ReportSheet', () => {
  it('sends a problem to the server admin from the two steps', async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-1', outcome: 'reported', answer: null, action: null } })
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

    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '555', problem: 'out_of_sync', note: 'From the start', swap: false })
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
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-2', outcome: 'joined', answer: null, action: null } })
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

    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '7001', problem: 'wont_start', note: '', swap: false })
    expect(await screen.findByTestId('report-sent')).toHaveTextContent('we added yours to it')
  })

  it("asks whether anything else plays on the member's player, and sends the answer", async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-3', outcome: 'reported', answer: null, action: null } })
    render(<ReportSheet selected={{ ...MOVIE, lastPlay: { player: 'Living Room', transcoded: false, at: '2026-11-08T20:00:00.000Z' } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-playback'))
    await user.click(within(screen.getByTestId('report-problem-wont_start')).getByText("Won't start"))
    expect(screen.getByTestId('report-device')).toBeInTheDocument()
    expect(screen.getByText('Does anything else play on Living Room?')).toBeInTheDocument()
    await user.click(within(screen.getByTestId('report-device-nothing_plays')).getByText('No, nothing plays'))
    expect(screen.getByTestId('report-device-guide')).toHaveAttribute('href', '/help#playback')
    await user.click(screen.getByTestId('report-send'))

    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '555', problem: 'wont_start', note: '', device: 'nothing_plays', swap: false })
  })

  it("offers a member's swap once other titles play on their player, says what it spends, and says it started", async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-9', outcome: 'fixing', answer: null, action: 'SWAP' } })
    const selected: SelectedTitle = {
      ...MOVIE,
      fixers: { radarr: true, sonarr: false },
      lastPlay: { player: 'Living Room', transcoded: false, at: '2026-11-08T20:00:00.000Z' },
      playedToEnd: false,
      swap: { ok: true, left: 1, of: 3, nextBack: 'Nov 12' },
    }
    render(<ReportSheet selected={selected} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-playback'))
    await user.click(within(screen.getByTestId('report-problem-wont_start')).getByText("Won't start"))
    expect(screen.getByTestId('report-send')).toHaveTextContent('Send to the server admin')
    await user.click(within(screen.getByTestId('report-device-others_play')).getByText('Yes, others play fine'))
    expect(screen.getByTestId('report-consequence')).toHaveTextContent('Uses 1 of your 3 swaps.')
    expect(screen.getByTestId('report-consequence-note')).toHaveTextContent('This is your last swap until Nov 12.')
    expect(screen.getByTestId('report-send')).toHaveTextContent('Swap the copy')
    await user.click(screen.getByTestId('report-send'))

    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '555', problem: 'wont_start', note: '', device: 'others_play', swap: true })
    expect(await screen.findByTestId('report-step-heading')).toHaveTextContent('Swapping the copy')
  })

  it("says why a member's swap goes to the server admin", async () => {
    const user = userEvent.setup()
    const selected: SelectedTitle = { ...MOVIE, fixers: { radarr: true, sonarr: false }, swap: { ok: false, reason: 'TITLE_RECENT', until: null } }
    render(<ReportSheet selected={selected} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-picture'))
    await user.click(within(screen.getByTestId('report-problem-filmed_off_screen')).getByText('Looks filmed off a screen'))

    expect(screen.getByTestId('report-consequence-note')).toHaveTextContent('This title was swapped recently.')
    expect(screen.getByTestId('report-send')).toHaveTextContent('Send to the server admin')
  })

  it("asks about a show's player for the whole show only, since another episode's last play may differ", async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-4', outcome: 'reported', answer: null, action: null } })
    render(<ReportSheet selected={{ ...SHOW, lastPlay: { player: 'Living Room', transcoded: false, at: '2026-11-08T20:00:00.000Z' } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-playback'))
    await user.click(within(screen.getByTestId('report-problem-wont_start')).getByText("Won't start"))
    expect(screen.getByText('Does anything else play on Living Room?')).toBeInTheDocument()
    await user.click(within(screen.getByTestId('report-device-nothing_plays')).getByText('No, nothing plays'))
    await user.click(screen.getByTestId('report-episode-trigger'))
    await user.click(await screen.findByTestId('report-episode-option-7001'))

    expect(screen.queryByTestId('report-device')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('report-send'))
    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '7001', problem: 'wont_start', note: '', swap: false })
  })

  it("looks for missing episodes, and says a fix started", async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-5', outcome: 'fixing', answer: null, action: 'LOOK_FOR_MISSING' } })
    render(<ReportSheet selected={{ ...SHOW, fixers: { radarr: false, sonarr: true } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-episodes'))
    await user.click(within(screen.getByTestId('report-problem-missing_episodes')).getByText('Episodes are missing'))
    expect(screen.getByTestId('report-consequence')).toHaveTextContent("We'll check which episodes are missing and look for them. Nothing is removed.")
    expect(screen.getByTestId('report-send')).toHaveTextContent('Look for them')
    await user.click(screen.getByTestId('report-send'))

    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '6999', problem: 'missing_episodes', note: '', swap: false })
    expect(await screen.findByTestId('report-sent-line')).toHaveTextContent("We'll look for the missing episodes now. Nothing is removed.")
  })

  it("answers instead of a report, with Overseerr's page to request what isn't on the server", async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValueOnce({
      success: true,
      data: { reportId: null, outcome: 'answered', answer: { kind: 'NOT_ON_SERVER', seasons: [3], requestHref: 'https://requests.example.com/tv/2316' }, action: null },
    })
    render(<ReportSheet selected={{ ...SHOW, fixers: { radarr: false, sonarr: true } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-episodes'))
    await user.click(within(screen.getByTestId('report-problem-missing_episodes')).getByText('Episodes are missing'))
    await user.click(screen.getByTestId('report-send'))

    expect(await screen.findByTestId('report-sent-line')).toHaveTextContent("Season 3 isn't on the server.")
    expect(screen.getByTestId('report-request')).toHaveAttribute('href', 'https://requests.example.com/tv/2316')
  })

  it("says when the next episode comes out", async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValueOnce({
      success: true,
      data: { reportId: null, outcome: 'answered', answer: { kind: 'NOT_AIRED', season: 2, episode: 6, airsAt: '2026-11-14T20:00:00Z' }, action: null },
    })
    render(<ReportSheet selected={{ ...SHOW, fixers: { radarr: false, sonarr: true } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-episodes'))
    await user.click(within(screen.getByTestId('report-problem-missing_episodes')).getByText('Episodes are missing'))
    await user.click(screen.getByTestId('report-send'))

    expect(await screen.findByTestId('report-sent-line')).toHaveTextContent(/^Season 2, episode 6 comes out Nov 14\.$/)
    expect(screen.queryByTestId('report-request')).not.toBeInTheDocument()
  })

  it('explains a converted play for a blurry picture, asks nothing about the device, and sends it to the server admin', async () => {
    const user = userEvent.setup()
    const selected = { ...MOVIE, fixers: { radarr: true, sonarr: true }, lastPlay: { player: 'Phone', transcoded: true, at: '2026-11-08T20:00:00.000Z' } }
    render(<ReportSheet selected={selected} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-picture'))
    await user.click(within(screen.getByTestId('report-problem-blurry')).getByText('Blurry or low quality'))

    expect(screen.getByTestId('report-transcode-tip')).toHaveTextContent('Your Plex app converted this video while you watched')
    expect(screen.queryByTestId('report-device')).not.toBeInTheDocument()
    expect(screen.getByTestId('report-consequence')).toHaveTextContent('Still blurry with the quality set to Maximum? Send it to the server admin.')
    expect(screen.getByTestId('report-send')).toHaveTextContent('Send to the server admin')
  })

  it('looks for a better copy of a movie Radarr has, and says it started', async () => {
    const user = userEvent.setup()
    jest.mocked(reportProblem).mockResolvedValue({ success: true, data: { reportId: 'report-6', outcome: 'fixing', answer: null, action: 'BETTER_COPY' } })
    render(<ReportSheet selected={{ ...MOVIE, fixers: { radarr: true, sonarr: false } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-picture'))
    await user.click(within(screen.getByTestId('report-problem-blurry')).getByText('Blurry or low quality'))
    expect(screen.getByTestId('report-consequence')).toHaveTextContent("We'll look for a better copy. If there isn't one, nothing changes.")
    expect(screen.getByTestId('report-send')).toHaveTextContent('Look for a better copy')
    await user.click(screen.getByTestId('report-send'))

    expect(reportProblem).toHaveBeenCalledWith({ ratingKey: '555', problem: 'blurry', note: '', swap: false })
    expect(await screen.findByTestId('report-step-heading')).toHaveTextContent('Looking for a better copy')
    expect(screen.getByTestId('report-sent-line')).toHaveTextContent("We'll look for a better copy now. The one you have keeps playing")
  })

  it("looks for a better copy of one of a show's episodes, never of the whole show", async () => {
    const user = userEvent.setup()
    render(<ReportSheet selected={{ ...SHOW, fixers: { radarr: false, sonarr: true } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-picture'))
    await user.click(within(screen.getByTestId('report-problem-blurry')).getByText('Blurry or low quality'))
    expect(screen.getByTestId('report-send')).toHaveTextContent('Send to the server admin')
    await user.click(screen.getByTestId('report-episode-trigger'))
    await user.click(await screen.findByTestId('report-episode-option-7001'))

    expect(screen.getByTestId('report-send')).toHaveTextContent('Look for a better copy')
  })

  it('says the file is the best copy the server keeps, and sends it to the server admin anyway when asked', async () => {
    const user = userEvent.setup()
    jest
      .mocked(reportProblem)
      .mockResolvedValueOnce({ success: true, data: { reportId: null, outcome: 'answered', answer: { kind: 'BEST_COPY' }, action: null } })
      .mockResolvedValueOnce({ success: true, data: { reportId: 'report-7', outcome: 'reported', answer: null, action: null } })
    render(<ReportSheet selected={{ ...MOVIE, fixers: { radarr: true, sonarr: false } }} closeHref="/report" />)

    await user.click(screen.getByTestId('report-kind-picture'))
    await user.click(within(screen.getByTestId('report-problem-blurry')).getByText('Blurry or low quality'))
    await user.type(screen.getByTestId('report-note'), 'Soft all through')
    await user.click(screen.getByTestId('report-send'))

    expect(await screen.findByTestId('report-sent-line')).toHaveTextContent('This is the best copy the server keeps.')
    await user.click(screen.getByTestId('report-send-anyway'))

    expect(reportProblem).toHaveBeenLastCalledWith({ ratingKey: '555', problem: 'blurry', note: 'Soft all through', swap: false, toAdmin: true })
    expect(await screen.findByTestId('report-sent-line')).toHaveTextContent('The server admin will take a look.')
    expect(screen.queryByTestId('report-send-anyway')).not.toBeInTheDocument()
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
