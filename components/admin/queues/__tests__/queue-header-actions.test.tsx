/**
 * The queue page's Pause confirm: it names what pausing holds back. Pausing
 * holds the main queue only, so Stripe access changes wait and Rewind, on
 * its own queues, does not.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { QueueHeaderActions } from '@/components/admin/queues/queue-header-actions'

jest.mock('@/actions/admin/queue', () => ({ pauseJobQueue: jest.fn(), resumeJobQueue: jest.fn(), triggerWatchlistSyncJob: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

describe('QueueHeaderActions', () => {
  it('says what waits while the queue is paused, without claiming Rewind runs stop', async () => {
    const user = userEvent.setup()
    render(<QueueHeaderActions paused={false} disabled={false} />)

    await user.click(screen.getByTestId('queue-pause-resume-btn'))

    const dialog = await screen.findByTestId('queue-pause-dialog')
    expect(dialog).toHaveTextContent("Waiting jobs don't run until you resume the queue. This includes Stripe access changes.")
    expect(dialog).not.toHaveTextContent('Rewind')
  })
})
