import { render, screen } from '@testing-library/react'
import { HeroSection } from '@/components/wrapped/wrapped-sections/hero-section'
import { WrappedSection } from '@/types/wrapped'

// Mock child components
jest.mock('../shared/formatted-text', () => ({
  FormattedText: ({ text }: { text: string }) => <span>{text}</span>,
}))

describe('HeroSection', () => {
  const createMockSection = (overrides?: Partial<WrappedSection>): WrappedSection => ({
    id: 'hero-1',
    type: 'hero',
    title: 'Welcome to Your Wrapped',
    content: 'This is your year in review',
    ...overrides,
  })

  it('should render title', () => {
    const section = createMockSection()
    render(<HeroSection section={section} sectionIndex={0} />)

    expect(screen.getByText('Welcome to Your Wrapped')).toBeInTheDocument()
  })

  it('should render subtitle when provided', () => {
    const section = createMockSection({
      subtitle: '2024 Edition',
    })
    render(<HeroSection section={section} sectionIndex={0} />)

    expect(screen.getByText('2024 Edition')).toBeInTheDocument()
  })

  it('should not render subtitle when not provided', () => {
    const section = createMockSection()
    render(<HeroSection section={section} sectionIndex={0} />)

    expect(screen.queryByText('2024 Edition')).not.toBeInTheDocument()
  })

  it('should render content', () => {
    const section = createMockSection({
      content: 'Your personalized viewing summary',
    })
    render(<HeroSection section={section} sectionIndex={0} />)

    expect(screen.getByText('Your personalized viewing summary')).toBeInTheDocument()
  })

  it('should render prominent stat with numeric value', () => {
    const section = createMockSection({
      data: {
        prominentStat: {
          value: 100,
          label: 'Movies Watched',
        },
      },
    })
    render(<HeroSection section={section} sectionIndex={0} />)

    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('Movies Watched')).toBeInTheDocument()
  })

  it('should render prominent stat with string value', () => {
    const section = createMockSection({
      data: {
        prominentStat: {
          value: '1,234',
          label: 'Total Hours',
        },
      },
    })
    render(<HeroSection section={section} sectionIndex={0} />)

    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('Total Hours')).toBeInTheDocument()
  })

  it('should render prominent stat description when provided', () => {
    const section = createMockSection({
      data: {
        prominentStat: {
          value: 50,
          label: 'Shows Watched',
          description: 'Across multiple genres',
        },
      },
    })
    render(<HeroSection section={section} sectionIndex={0} />)

    expect(screen.getByText('Across multiple genres')).toBeInTheDocument()
  })

  it('should not render prominent stat when not provided', () => {
    const section = createMockSection()
    render(<HeroSection section={section} sectionIndex={0} />)

    expect(screen.queryByText('Movies Watched')).not.toBeInTheDocument()
  })

  it('should handle sectionIndex prop', () => {
    const section = createMockSection()
    const { rerender } = render(<HeroSection section={section} sectionIndex={0} />)

    // Should not crash with different indices
    rerender(<HeroSection section={section} sectionIndex={5} />)
    expect(screen.getByText('Welcome to Your Wrapped')).toBeInTheDocument()
  })

  it('should render formatted text in content', () => {
    const section = createMockSection({
      content: 'Hello <highlight>world</highlight>!',
    })
    render(<HeroSection section={section} sectionIndex={0} />)

    // FormattedText component should handle the content
    expect(screen.getByText('Hello <highlight>world</highlight>!')).toBeInTheDocument()
  })

  it('should handle empty content', () => {
    const section = createMockSection({
      content: '',
    })
    render(<HeroSection section={section} sectionIndex={0} />)

    expect(screen.getByText('Welcome to Your Wrapped')).toBeInTheDocument()
  })

  it('should handle prominent stat with zero value', () => {
    const section = createMockSection({
      data: {
        prominentStat: {
          value: 0,
          label: 'Episodes',
        },
      },
    })
    const { container } = render(<HeroSection section={section} sectionIndex={0} />)

    // CountUp's screen-reader copy of the final value.
    expect(container.querySelector('.sr-only')).toHaveTextContent('0')
    expect(screen.getByText('Episodes')).toBeInTheDocument()
  })
})

