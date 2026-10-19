import { FinalStep } from '@/components/onboarding/onboarding-steps/final-step'
import { fireEvent, render, screen } from '@testing-library/react'

// Mock motion to avoid animation issues in tests
jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

describe('FinalStep', () => {
  const mockOnComplete = jest.fn()
  const mockOnBack = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render the main heading', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      expect(screen.getByText("You're All Set!")).toBeInTheDocument()
    })

    it('should render the completion message', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      expect(
        screen.getByText(
          /You're ready to start exploring the dashboard./
        )
      ).toBeInTheDocument()
    })

    it('should render the Next Steps heading', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      expect(screen.getByText("What's Next:")).toBeInTheDocument()
    })

    it('should render all three next steps', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      expect(screen.getByText('Browse available media on the Plex app')).toBeInTheDocument()
      expect(screen.getByText('View server statistics and insights')).toBeInTheDocument()
      expect(screen.getByText('Manage your requests and watch history')).toBeInTheDocument()
    })

    it('should render Back and Go to Dashboard buttons', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Go to Dashboard' })).toBeInTheDocument()
    })

    it('should render the celebration icon', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const icons = container.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)
    })
  })

  describe('User Interactions', () => {
    it('should call onComplete when Go to Dashboard button is clicked', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const button = screen.getByRole('button', { name: 'Go to Dashboard' })
      fireEvent.click(button)

      expect(mockOnComplete).toHaveBeenCalledTimes(1)
      expect(mockOnBack).not.toHaveBeenCalled()
    })

    it('should call onBack when Back button is clicked', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const button = screen.getByRole('button', { name: 'Back' })
      fireEvent.click(button)

      expect(mockOnBack).toHaveBeenCalledTimes(1)
      expect(mockOnComplete).not.toHaveBeenCalled()
    })

    it('should handle multiple clicks on Go to Dashboard button', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const button = screen.getByRole('button', { name: 'Go to Dashboard' })
      fireEvent.click(button)
      fireEvent.click(button)

      expect(mockOnComplete).toHaveBeenCalledTimes(2)
    })

    it('should handle multiple clicks on Back button', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const button = screen.getByRole('button', { name: 'Back' })
      fireEvent.click(button)
      fireEvent.click(button)

      expect(mockOnBack).toHaveBeenCalledTimes(2)
    })
  })

  describe('Accessibility', () => {
    it('should have proper button roles', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Go to Dashboard' })).toBeInTheDocument()
    })

    it('should have accessible heading', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const heading = screen.getByRole('heading', { name: "You're All Set!" })
      expect(heading).toBeInTheDocument()
    })

    it('should have accessible subheading', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const subheading = screen.getByRole('heading', { name: "What's Next:" })
      expect(subheading).toBeInTheDocument()
    })
  })

  describe('Layout Structure', () => {
    it('should have proper spacing classes', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const spaceElements = container.querySelectorAll('.space-y-6, .space-y-4')
      expect(spaceElements.length).toBeGreaterThan(0)
    })

    it('should render buttons in a flex container', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const flexContainer = container.querySelector('.flex.justify-between')
      expect(flexContainer).toBeInTheDocument()
    })

    it('should render next steps in a list format', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const list = container.querySelector('ul')
      expect(list).toBeInTheDocument()
    })

    it('should have three list items for next steps', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const listItems = container.querySelectorAll('li')
      expect(listItems).toHaveLength(3)
    })
  })

  describe('Visual Elements', () => {
    it('should render gradient text for the heading', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const gradientText = container.querySelector('.bg-gradient-to-r')
      expect(gradientText).toBeInTheDocument()
    })

    it('should render gradient button for Go to Dashboard', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const gradientButtons = container.querySelectorAll('.bg-gradient-to-r')
      expect(gradientButtons.length).toBeGreaterThan(0)
    })

    it('should render celebration icon with gradient background', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const gradientBackground = container.querySelector('.bg-gradient-to-br')
      expect(gradientBackground).toBeInTheDocument()
    })

    it('should render colored bullet points for next steps', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      expect(container.querySelector('.text-cyan-400')).toBeInTheDocument()
      expect(container.querySelector('.text-purple-400')).toBeInTheDocument()
      expect(container.querySelector('.text-pink-400')).toBeInTheDocument()
    })

    it('should render info box with proper styling', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const infoBox = container.querySelector('.bg-slate-800\\/50')
      expect(infoBox).toBeInTheDocument()
    })
  })

  describe('Content Validation', () => {
    it('should display next steps in correct order', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const listItems = container.querySelectorAll('li')
      expect(listItems[0]).toHaveTextContent('Browse available media on the Plex app')
      expect(listItems[1]).toHaveTextContent('View server statistics and insights')
      expect(listItems[2]).toHaveTextContent('Manage your requests and watch history')
    })

    it('should have appropriate completion message tone', () => {
      render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      expect(screen.getByText("You're All Set!")).toBeInTheDocument()
      expect(screen.getByText(/You're ready to start exploring/)).toBeInTheDocument()
    })
  })

  describe('Icon Rendering', () => {
    it('should render sparkle icon in the celebration circle', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const sparkleIcon = container.querySelector('.w-32.h-32 svg')
      expect(sparkleIcon).toBeInTheDocument()
    })

    it('should render icon with proper size classes', () => {
      const { container } = render(<FinalStep onComplete={mockOnComplete} onBack={mockOnBack} />)

      const iconContainer = container.querySelector('.w-32.h-32')
      expect(iconContainer).toBeInTheDocument()
    })
  })
})

