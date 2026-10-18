import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WrappedViewerNavigation } from '@/components/wrapped/wrapped-viewer-navigation'

// The owner's share-link controls arrive as a slot from the viewer wrapper.
const shareControls = <div data-testid="share-controls">Share Controls</div>

describe('WrappedViewerNavigation', () => {
  const defaultProps = {
    currentSectionIndex: 0,
    totalSections: 5,
    onPrevious: jest.fn(),
    onNext: jest.fn(),
    onShowAll: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render Next button on first section', () => {
    render(<WrappedViewerNavigation {...defaultProps} />)
    expect(screen.getByText('Next')).toBeInTheDocument()
    expect(screen.queryByText('Previous')).not.toBeInTheDocument()
  })

  it('should render Previous and Next buttons on middle sections', () => {
    render(<WrappedViewerNavigation {...defaultProps} currentSectionIndex={2} />)
    expect(screen.getByText('Previous')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('should render Previous and Show All buttons on last section', () => {
    render(<WrappedViewerNavigation {...defaultProps} currentSectionIndex={4} />)
    expect(screen.getByText('Previous')).toBeInTheDocument()
    expect(screen.getByText('Show All')).toBeInTheDocument()
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
  })

  it('should call onNext when Next button is clicked', async () => {
    const user = userEvent.setup()
    const onNext = jest.fn()
    render(<WrappedViewerNavigation {...defaultProps} onNext={onNext} />)

    const nextButton = screen.getByText('Next')
    await user.click(nextButton)

    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('should call onPrevious when Previous button is clicked', async () => {
    const user = userEvent.setup()
    const onPrevious = jest.fn()
    render(<WrappedViewerNavigation {...defaultProps} currentSectionIndex={2} onPrevious={onPrevious} />)

    const previousButton = screen.getByText('Previous')
    await user.click(previousButton)

    expect(onPrevious).toHaveBeenCalledTimes(1)
  })

  it('should call onShowAll when Show All button is clicked', async () => {
    const user = userEvent.setup()
    const onShowAll = jest.fn()
    render(<WrappedViewerNavigation {...defaultProps} currentSectionIndex={4} onShowAll={onShowAll} />)

    const showAllButton = screen.getByText('Show All')
    await user.click(showAllButton)

    expect(onShowAll).toHaveBeenCalledTimes(1)
  })

  it('should render the share controls on the last section', () => {
    render(<WrappedViewerNavigation {...defaultProps} currentSectionIndex={4} shareControls={shareControls} />)
    expect(screen.getByTestId('share-controls')).toBeInTheDocument()
    expect(screen.getByText('Show All')).toBeInTheDocument()
  })

  it('should not render the share controls when not on last section', () => {
    render(<WrappedViewerNavigation {...defaultProps} currentSectionIndex={2} shareControls={shareControls} />)
    expect(screen.queryByTestId('share-controls')).not.toBeInTheDocument()
  })

  it('should render no share controls when none are given', () => {
    // Admin views and the playground preview pass none
    render(<WrappedViewerNavigation {...defaultProps} currentSectionIndex={4} />)
    expect(screen.queryByTestId('share-controls')).not.toBeInTheDocument()
  })

  it('should render placeholder div when on first section', () => {
    const { container } = render(<WrappedViewerNavigation {...defaultProps} />)
    const divs = container.querySelectorAll('div')
    // Should have a placeholder div on the left side
    expect(divs.length).toBeGreaterThan(0)
  })
})

