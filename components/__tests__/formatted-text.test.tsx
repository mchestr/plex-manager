import { render, screen } from '@testing-library/react'
import { useReducedMotion } from 'motion/react'
import { FormattedText } from '@/components/shared/formatted-text'

describe('FormattedText', () => {
  it('should render plain text without styling tags', () => {
    render(<FormattedText text="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('should render text with highlight tags', () => {
    render(<FormattedText text="Hello <highlight>world</highlight>!" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('world')).toBeInTheDocument()
    expect(screen.getByText('!')).toBeInTheDocument()
  })

  it('should render text with multiple highlight tags', () => {
    const { container } = render(<FormattedText text="<highlight>First</highlight> and <highlight>second</highlight>" />)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
    // Check that "and" is present in the rendered output
    expect(container).toHaveTextContent(/and/)
  })

  it('should handle backward compatibility with double asterisks', () => {
    render(<FormattedText text="Hello **world**!" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('world')).toBeInTheDocument()
    expect(screen.getByText('!')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<FormattedText text="Test" className="custom-class" />)
    expect(container.querySelector('.custom-class')).toBeInTheDocument()
  })

  it('should handle empty text', () => {
    const { container } = render(<FormattedText text="" />)
    expect(container).toBeInTheDocument()
  })

  it('should handle text with only whitespace', () => {
    const { container } = render(<FormattedText text="   " />)
    expect(container).toBeInTheDocument()
  })

  it('should handle nested highlight tags gracefully', () => {
    // This should not crash, even if the parser doesn't handle nesting perfectly
    expect(() => {
      render(<FormattedText text="<highlight>Outer <highlight>inner</highlight></highlight>" />)
    }).not.toThrow()
  })

  it('should handle unclosed highlight tags', () => {
    expect(() => {
      render(<FormattedText text="<highlight>Unclosed" />)
    }).not.toThrow()
  })

  it('should handle highlight tags with empty content', () => {
    render(<FormattedText text="Before<highlight></highlight>After" />)
    expect(screen.getByText('Before')).toBeInTheDocument()
    expect(screen.getByText('After')).toBeInTheDocument()
  })

  describe('highlight pulse', () => {
    const motionProps = (element: HTMLElement) => ({
      animate: JSON.parse(element.dataset.animate ?? 'null'),
      transition: JSON.parse(element.dataset.transition ?? 'null'),
    })

    afterEach(() => jest.mocked(useReducedMotion).mockReturnValue(false))

    it('loops the highlight scale', () => {
      render(<FormattedText text="Hello <highlight>world</highlight>" />)

      const { animate, transition } = motionProps(screen.getByText('world'))
      expect(animate).toEqual({ scale: [1, 1.05, 1] })
      // Infinity serialises as null.
      expect(transition).toMatchObject({ repeat: null, repeatDelay: 3 })
    })

    it('rests on the final keyframe under reduced motion', () => {
      jest.mocked(useReducedMotion).mockReturnValue(true)
      render(<FormattedText text="Hello <highlight>world</highlight>" />)

      expect(motionProps(screen.getByText('world'))).toEqual({
        animate: { scale: 1 },
        transition: { duration: 0 },
      })
    })
  })
})
