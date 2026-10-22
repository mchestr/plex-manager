import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { makeDiscordCommandActivity, makeMediaMarkActivity, makeUserActivityTimelineData } from '@/__tests__/utils/test-builders'
import { getUserActivityTimeline } from '@/actions/user-queries'
import { UserActivityTimeline } from '@/components/admin/users/user-activity-timeline'

jest.mock('@/actions/user-queries', () => ({ getUserActivityTimeline: jest.fn() }))

const mockTimeline = getUserActivityTimeline as jest.MockedFunction<typeof getUserActivityTimeline>

function renderTimeline(initialData = makeUserActivityTimelineData()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <UserActivityTimeline userId="user-1" initialData={initialData} />
    </QueryClientProvider>
  )
}

describe('UserActivityTimeline', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders Discord commands and media marks with their words', () => {
    renderTimeline(
      makeUserActivityTimelineData({
        items: [
          makeDiscordCommandActivity({ id: 'd1', commandName: '!finished', status: 'SUCCESS', responseTimeMs: 250, channelType: 'dm' }),
          makeMediaMarkActivity({ id: 'm1', markType: 'KEEP_FOREVER', title: 'Arrival', year: 2016 }),
        ],
      })
    )

    expect(screen.getByTestId('activity-item-d1')).toHaveTextContent('!finished')
    expect(screen.getByTestId('activity-item-d1')).toHaveTextContent('Success')
    expect(screen.getByTestId('activity-item-d1')).toHaveTextContent('250 ms')
    expect(screen.getByTestId('activity-item-m1')).toHaveTextContent('Keep forever')
    expect(screen.getByTestId('activity-item-m1')).toHaveTextContent('Arrival (2016)')
  })

  it('shows the empty copy with no activity', () => {
    renderTimeline(makeUserActivityTimelineData({ items: [], total: 0 }))
    expect(screen.getByText('No activity recorded for this member yet.')).toBeInTheDocument()
  })

  it('has no "Show older activity" on the last page', () => {
    renderTimeline()
    expect(screen.getByTestId('activity-count')).toHaveTextContent('Showing 2 of 2')
    expect(screen.queryByTestId('activity-show-older')).not.toBeInTheDocument()
  })

  it('loads the next keyset page with the cursor and counts both pages', async () => {
    const user = userEvent.setup()
    mockTimeline.mockResolvedValue({
      success: true,
      data: makeUserActivityTimelineData({ items: [makeMediaMarkActivity({ id: 'm-older' })], total: 3, nextCursor: null }),
    })
    renderTimeline(makeUserActivityTimelineData({ total: 3, nextCursor: 'cursor-1' }))

    expect(screen.getByTestId('activity-count')).toHaveTextContent('Showing 2 of 3')
    await user.click(screen.getByTestId('activity-show-older'))

    expect(await screen.findByTestId('activity-item-m-older')).toBeInTheDocument()
    expect(mockTimeline).toHaveBeenCalledWith({ userId: 'user-1', cursor: 'cursor-1', pageSize: 10 })
    expect(screen.getByTestId('activity-count')).toHaveTextContent('Showing 3 of 3')
    expect(screen.queryByTestId('activity-show-older')).not.toBeInTheDocument()
  })

  it('says so when the older page fails', async () => {
    const user = userEvent.setup()
    mockTimeline.mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Could not load the activity' })
    renderTimeline(makeUserActivityTimelineData({ total: 3, nextCursor: 'cursor-1' }))

    await user.click(screen.getByTestId('activity-show-older'))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load older activity")
  })
})
