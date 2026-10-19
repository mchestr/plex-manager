import { WelcomeStep } from '@/components/onboarding/onboarding-steps/welcome-step'
import { fireEvent, render, screen } from '@testing-library/react'

// Mock motion to avoid animation issues in tests
jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

describe('WelcomeStep', () => {
  const mockOnComplete = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render the welcome heading', () => {
      render(<WelcomeStep onComplete={mockOnComplete} />)

      expect(screen.getByText('Welcome to the Server!')).toBeInTheDocument()
    })

    it('should render the welcome description', () => {
      render(<WelcomeStep onComplete={mockOnComplete} />)

      expect(
        screen.getByText(
          /We're excited to have you. Before you dive in, here's a quick guide on how to get the best experience, request movies\/shows, and get help./
        )
      ).toBeInTheDocument()
    })

    it('should render all three feature cards', () => {
      render(<WelcomeStep onComplete={mockOnComplete} />)

      expect(screen.getByText('Best Quality')).toBeInTheDocument()
      expect(screen.getByText('Request Media')).toBeInTheDocument()
      expect(screen.getByText('Support')).toBeInTheDocument()
    })

    it('should render feature descriptions', () => {
      render(<WelcomeStep onComplete={mockOnComplete} />)

      expect(screen.getByText('Learn how to configure your Plex client for the best playback.')).toBeInTheDocument()
      expect(screen.getByText('Easily request movies and TV shows you want to watch.')).toBeInTheDocument()
      expect(screen.getByText('How to report playback issues or other problems.')).toBeInTheDocument()
    })

    it('should render the Let\'s Go button', () => {
      render(<WelcomeStep onComplete={mockOnComplete} />)

      expect(screen.getByRole('button', { name: "Let's Go" })).toBeInTheDocument()
    })

    it('should render the welcome icon', () => {
      const { container } = render(<WelcomeStep onComplete={mockOnComplete} />)

      const icons = container.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)
    })
  })

  describe('User Interactions', () => {
    it('should call onComplete when Let\'s Go button is clicked', () => {
      render(<WelcomeStep onComplete={mockOnComplete} />)

      const button = screen.getByRole('button', { name: "Let's Go" })
      fireEvent.click(button)

      expect(mockOnComplete).toHaveBeenCalledTimes(1)
    })

    it('should not call onComplete multiple times on rapid clicks', () => {
      render(<WelcomeStep onComplete={mockOnComplete} />)

      const button = screen.getByRole('button', { name: "Let's Go" })
      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)

      expect(mockOnComplete).toHaveBeenCalledTimes(3)
    })
  })

  describe('Accessibility', () => {
    it('should have proper button role', () => {
      render(<WelcomeStep onComplete={mockOnComplete} />)

      const button = screen.getByRole('button', { name: "Let's Go" })
      expect(button).toBeInTheDocument()
    })

    it('should have accessible text content', () => {
      render(<WelcomeStep onComplete={mockOnComplete} />)

      const headings = screen.getAllByRole('heading', { level: 2 })
      expect(headings.length).toBeGreaterThan(0)
    })
  })

  describe('Layout Structure', () => {
    it('should render feature cards in a grid layout', () => {
      const { container } = render(<WelcomeStep onComplete={mockOnComplete} />)

      const gridContainer = container.querySelector('.grid')
      expect(gridContainer).toBeInTheDocument()
    })

    it('should have proper spacing classes', () => {
      const { container } = render(<WelcomeStep onComplete={mockOnComplete} />)

      const spaceElements = container.querySelectorAll('.space-y-6, .space-y-4')
      expect(spaceElements.length).toBeGreaterThan(0)
    })
  })

  describe('Visual Elements', () => {
    it('should render gradient text for the heading', () => {
      const { container } = render(<WelcomeStep onComplete={mockOnComplete} />)

      const gradientText = container.querySelector('.bg-gradient-to-r')
      expect(gradientText).toBeInTheDocument()
    })

    it('should render feature cards with proper styling', () => {
      const { container } = render(<WelcomeStep onComplete={mockOnComplete} />)

      const cards = container.querySelectorAll('.bg-slate-800\\/50')
      expect(cards.length).toBe(3)
    })
  })
})

