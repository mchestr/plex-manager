import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserActivityTimeline } from '../admin/users/user-activity-timeline'
import {
  makeDiscordCommandActivity,
  makeMediaMarkActivity,
  makeUserActivityTimelineData,
} from '@/__tests__/utils/test-builders'
import * as userQueriesActions from '@/actions/user-queries'

// Mock server action
jest.mock('@/actions/user-queries', () => ({
  getUserActivityTimeline: jest.fn(),
}))

describe('UserActivityTimeline', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    jest.clearAllMocks()
  })

  const renderComponent = (props: Parameters<typeof UserActivityTimeline>[0]) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <UserActivityTimeline {...props} />
      </QueryClientProvider>
    )
  }

  describe('rendering activities', () => {
    it('should render Discord command activities', () => {
      const discordActivity = makeDiscordCommandActivity({
        id: 'discord-1',
        commandName: '!finished',
        status: 'SUCCESS',
        responseTimeMs: 250,
        channelType: 'dm',
      })
      const initialData = makeUserActivityTimelineData({
        items: [discordActivity],
        total: 1,
      })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByTestId('activity-item-discord-1')).toBeInTheDocument()
      expect(screen.getByText('Discord')).toBeInTheDocument()
      expect(screen.getByText('!finished')).toBeInTheDocument()
      expect(screen.getByText('Success')).toBeInTheDocument()
      expect(screen.getByText('250ms')).toBeInTheDocument()
      expect(screen.getByText('via dm')).toBeInTheDocument()
    })

    it('should render Media mark activities', () => {
      const mediaActivity = makeMediaMarkActivity({
        id: 'mark-1',
        markType: 'FINISHED_WATCHING',
        title: 'The Matrix',
        year: 1999,
        markedVia: 'discord',
      })
      const initialData = makeUserActivityTimelineData({
        items: [mediaActivity],
        total: 1,
      })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByTestId('activity-item-mark-1')).toBeInTheDocument()
      expect(screen.getByText('Media Mark')).toBeInTheDocument()
      expect(screen.getByText('Finished')).toBeInTheDocument()
      expect(screen.getByText('The Matrix (1999)')).toBeInTheDocument()
      expect(screen.getByText('via discord')).toBeInTheDocument()
    })

    it('should render mixed activity types sorted by timestamp', () => {
      const discordActivity = makeDiscordCommandActivity({ id: 'discord-1' })
      const mediaActivity = makeMediaMarkActivity({ id: 'mark-1' })
      const initialData = makeUserActivityTimelineData({
        items: [discordActivity, mediaActivity],
        total: 2,
      })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByTestId('activity-item-discord-1')).toBeInTheDocument()
      expect(screen.getByTestId('activity-item-mark-1')).toBeInTheDocument()
    })

    it('should render empty state when no activities exist', () => {
      const initialData = makeUserActivityTimelineData({
        items: [],
        total: 0,
      })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByText('No activity recorded for this user yet')).toBeInTheDocument()
    })
  })

  describe('Discord command status badges', () => {
    it('should render SUCCESS status with green badge', () => {
      const activity = makeDiscordCommandActivity({ status: 'SUCCESS' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Success')
      expect(badge).toHaveClass('bg-green-500/20', 'text-green-400')
    })

    it('should render FAILED status with red badge', () => {
      const activity = makeDiscordCommandActivity({ status: 'FAILED' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Failed')
      expect(badge).toHaveClass('bg-red-500/20', 'text-red-400')
    })

    it('should render PENDING status with yellow badge', () => {
      const activity = makeDiscordCommandActivity({ status: 'PENDING' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Pending')
      expect(badge).toHaveClass('bg-yellow-500/20', 'text-yellow-400')
    })

    it('should render TIMEOUT status with orange badge', () => {
      const activity = makeDiscordCommandActivity({ status: 'TIMEOUT' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Timeout')
      expect(badge).toHaveClass('bg-orange-500/20', 'text-orange-400')
    })
  })

  describe('media mark type badges', () => {
    it('should render FINISHED_WATCHING with blue badge', () => {
      const activity = makeMediaMarkActivity({ markType: 'FINISHED_WATCHING' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Finished')
      expect(badge).toHaveClass('bg-blue-500/20', 'text-blue-400')
    })

    it('should render NOT_INTERESTED with red badge', () => {
      const activity = makeMediaMarkActivity({ markType: 'NOT_INTERESTED' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Not Interested')
      expect(badge).toHaveClass('bg-red-500/20', 'text-red-400')
    })

    it('should render KEEP_FOREVER with green badge', () => {
      const activity = makeMediaMarkActivity({ markType: 'KEEP_FOREVER' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Keep Forever')
      expect(badge).toHaveClass('bg-green-500/20', 'text-green-400')
    })

    it('should render REWATCH_CANDIDATE with cyan badge', () => {
      const activity = makeMediaMarkActivity({ markType: 'REWATCH_CANDIDATE' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Rewatch')
      expect(badge).toHaveClass('bg-cyan-500/20', 'text-cyan-400')
    })

    it('should render POOR_QUALITY with orange badge', () => {
      const activity = makeMediaMarkActivity({ markType: 'POOR_QUALITY' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Poor Quality')
      expect(badge).toHaveClass('bg-orange-500/20', 'text-orange-400')
    })

    it('should render WRONG_VERSION with amber badge', () => {
      const activity = makeMediaMarkActivity({ markType: 'WRONG_VERSION' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      const badge = screen.getByText('Wrong Version')
      expect(badge).toHaveClass('bg-amber-500/20', 'text-amber-400')
    })
  })

  describe('media title formatting', () => {
    it('should format movie title with year', () => {
      const activity = makeMediaMarkActivity({
        mediaType: 'MOVIE',
        title: 'Inception',
        year: 2010,
      })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByText('Inception (2010)')).toBeInTheDocument()
    })

    it('should format episode title with show name and episode info', () => {
      const activity = makeMediaMarkActivity({
        mediaType: 'EPISODE',
        title: 'Pilot',
        parentTitle: 'Breaking Bad',
        seasonNumber: 1,
        episodeNumber: 1,
        year: null,
      })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByText('Breaking Bad S1E1: Pilot')).toBeInTheDocument()
    })

    it('should format movie title without year when year is null', () => {
      const activity = makeMediaMarkActivity({
        mediaType: 'MOVIE',
        title: 'Unknown Movie',
        year: null,
      })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByText('Unknown Movie')).toBeInTheDocument()
    })
  })

  describe('command arguments', () => {
    it('should display command arguments when present', () => {
      const activity = makeDiscordCommandActivity({
        commandName: '!assistant',
        commandArgs: 'recommend action movies',
      })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByText('recommend action movies')).toBeInTheDocument()
    })

    it('should not display command arguments section when null', () => {
      const activity = makeDiscordCommandActivity({
        commandName: '!help',
        commandArgs: null,
      })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByText('!help')).toBeInTheDocument()
      // Only one line should have arguments section
    })
  })

  describe('pagination', () => {
    it('should not show pagination when totalPages is 1', () => {
      const initialData = makeUserActivityTimelineData({
        items: [makeDiscordCommandActivity()],
        total: 1,
        totalPages: 1,
      })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    })

    it('should show pagination when totalPages is greater than 1', () => {
      const initialData = makeUserActivityTimelineData({
        items: [makeDiscordCommandActivity()],
        total: 25,
        page: 1,
        pageSize: 10,
        totalPages: 3,
      })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })

    it('should fetch new page when pagination is clicked', async () => {
      const page1Data = makeUserActivityTimelineData({
        items: [makeDiscordCommandActivity({ id: 'cmd-1' })],
        total: 20,
        page: 1,
        pageSize: 10,
        totalPages: 2,
      })
      const page2Data = makeUserActivityTimelineData({
        items: [makeDiscordCommandActivity({ id: 'cmd-2' })],
        total: 20,
        page: 2,
        pageSize: 10,
        totalPages: 2,
      })

      ;(userQueriesActions.getUserActivityTimeline as jest.Mock).mockResolvedValue(page2Data)

      renderComponent({ userId: 'user-1', initialData: page1Data })

      const user = userEvent.setup()

      // Click next page
      const nextButton = screen.getByTestId('pagination-next')
      await user.click(nextButton)

      await waitFor(() => {
        expect(userQueriesActions.getUserActivityTimeline).toHaveBeenCalledWith(
          'user-1',
          { page: 2, pageSize: 10 }
        )
      })
    })
  })

  describe('test IDs', () => {
    it('should have correct data-testid attributes', () => {
      const activity = makeDiscordCommandActivity({ id: 'test-id-123' })
      const initialData = makeUserActivityTimelineData({ items: [activity], total: 1 })

      renderComponent({ userId: 'user-1', initialData })

      expect(screen.getByTestId('user-activity-timeline')).toBeInTheDocument()
      expect(screen.getByTestId('activity-item-test-id-123')).toBeInTheDocument()
      expect(screen.getByTestId('activity-type-badge')).toBeInTheDocument()
    })
  })
})
