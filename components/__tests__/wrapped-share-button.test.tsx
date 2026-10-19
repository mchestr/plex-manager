// Mock motion before imports
jest.mock('motion/react', () => ({
  motion: {
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    svg: ({ children, ...props }: any) => <svg {...props}>{children}</svg>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WrappedShareButton } from '@/components/wrapped/wrapped-share-button'

// Mock navigator.clipboard
const mockWriteText = jest.fn()

describe('WrappedShareButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWriteText.mockResolvedValue(undefined)
    jest.useFakeTimers()

    // Setup navigator.clipboard mock
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('should render share button', () => {
    render(<WrappedShareButton shareToken="test-token" year={2024} />)
    expect(screen.getByText('Share')).toBeInTheDocument()
  })

  it('should show "Copied!" message after copying', async () => {
    const user = userEvent.setup({ delay: null })

    render(<WrappedShareButton shareToken="test-token" year={2024} />)

    const button = screen.getByText('Share').closest('button')
    await user.click(button!)

    // Wait for "Copied!" to appear
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('should hide "Copied!" message after 2 seconds', async () => {
    const user = userEvent.setup({ delay: null })

    render(<WrappedShareButton shareToken="test-token" year={2024} />)

    const button = screen.getByText('Share').closest('button')
    await user.click(button!)

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })

    jest.advanceTimersByTime(2000)

    await waitFor(() => {
      expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
    })
  })

  it('should show tooltip on hover', async () => {
    const user = userEvent.setup({ delay: null })

    render(<WrappedShareButton shareToken="test-token" year={2024} />)

    const button = screen.getByText('Share').closest('button')
    await user.hover(button!)

    await waitFor(() => {
      expect(screen.getByText('Share your wrapped summary')).toBeInTheDocument()
    })
  })

  it('should hide tooltip when copied', async () => {
    const user = userEvent.setup({ delay: null })

    render(<WrappedShareButton shareToken="test-token" year={2024} />)

    const button = screen.getByText('Share').closest('button')
    await user.hover(button!)

    await waitFor(() => {
      expect(screen.getByText('Share your wrapped summary')).toBeInTheDocument()
    })

    await user.click(button!)

    // Wait for tooltip to be hidden (copied state is true)
    await waitFor(() => {
      expect(screen.queryByText('Share your wrapped summary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })
})
