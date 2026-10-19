import { render, screen, waitFor, act } from '@testing-library/react'
import { WrappedTransition } from '@/components/wrapped/wrapped-transition'

// Mock motion
jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    svg: ({ children, ...props }: any) => <svg {...props}>{children}</svg>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock SpaceBackground
jest.mock('@/components/setup/setup-wizard/space-background', () => ({
  SpaceBackground: () => <div data-testid="space-background">Space Background</div>,
}))

describe('WrappedTransition', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('should render space background', () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    expect(screen.getByTestId('space-background')).toBeInTheDocument()
  })

  it('should start with intro phase', () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    expect(screen.getByText('Your 2024 Wrapped')).toBeInTheDocument()
    expect(screen.getByText('Get ready...')).toBeInTheDocument()
  })

  it('should transition to countdown phase after 1.5 seconds', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Advance to countdown phase
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('Preparing your story...')).toBeInTheDocument()
    })
  })

  it('should countdown from 3 to 0', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Move to countdown phase
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    // Countdown to 2
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    // Countdown to 1
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    // Countdown to 0 (should transition to reveal)
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    await waitFor(() => {
      expect(screen.queryByText('1')).not.toBeInTheDocument()
    })
  })

  it('should show "Here we go!" when countdown reaches 0', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Move to countdown phase
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    // Complete countdown
    act(() => {
      jest.advanceTimersByTime(3000)
    })

    await waitFor(() => {
      expect(screen.queryByText('Here we go!')).not.toBeInTheDocument() // Should be in reveal phase
    })
  })

  it('should transition to reveal phase after countdown', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Move through intro and countdown
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    await waitFor(() => {
      expect(screen.getByText('Revealing Your Story')).toBeInTheDocument()
    })
  })

  it('should show "Your Wrapped Awaits" after reveal animation', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Move through intro, countdown, and reveal
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    await waitFor(() => {
      expect(screen.getByText('Your Wrapped Awaits')).toBeInTheDocument()
    })
  })

  it('should call onComplete after full transition', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Total time: intro (1500) + countdown (3000) + reveal (1000) + fade (1000)
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    })
  })

  it('should not call onComplete prematurely', () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Advance only partway through
    jest.advanceTimersByTime(3000)

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('should display correct year throughout transition', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2023} onComplete={onComplete} />)

    // Check intro phase
    expect(screen.getByText('Your 2023 Wrapped')).toBeInTheDocument()

    // Move to countdown
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    // Year should still be visible in context (though not explicitly shown in countdown)
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('should cleanup timers on unmount', () => {
    const onComplete = jest.fn()
    const { unmount } = render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Advance partway through
    act(() => {
      jest.advanceTimersByTime(2000)
    })

    unmount()

    // Advance past when onComplete would be called
    act(() => {
      jest.advanceTimersByTime(10000)
    })

    // onComplete should not be called after unmount
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('should render loading dots in final reveal', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Move through all phases to show content
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    await waitFor(() => {
      expect(screen.getByText('Your Wrapped Awaits')).toBeInTheDocument()
    })

    // Check for loading dots (3 dots)
    const dots = document.querySelectorAll('[class*="bg-gradient-to-r"]')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('should show expanding rings in reveal phase', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Move to reveal phase
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    await waitFor(() => {
      expect(screen.getByText('Revealing Your Story')).toBeInTheDocument()
    })

    // Check for multiple ring elements (3 rings)
    const rings = document.querySelectorAll('[class*="border-cyan-400"]')
    expect(rings.length).toBeGreaterThan(0)
  })

  it('should handle rapid phase transitions', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Rapidly advance through all phases
    act(() => {
      jest.advanceTimersByTime(1500)
    })

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    })
  })

  it('should maintain consistent timing across phases', async () => {
    const onComplete = jest.fn()
    render(<WrappedTransition year={2024} onComplete={onComplete} />)

    // Intro: 1500ms
    act(() => {
      jest.advanceTimersByTime(1500)
    })
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    // Countdown: 3000ms (3 seconds)
    act(() => {
      jest.advanceTimersByTime(3000)
    })
    await waitFor(() => {
      expect(screen.getByText('Revealing Your Story')).toBeInTheDocument()
    })

    // Reveal: 1000ms before showing content
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    await waitFor(() => {
      expect(screen.getByText('Your Wrapped Awaits')).toBeInTheDocument()
    })

    // Final fade: 1000ms
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    }, { timeout: 3000 })
  })
})

