import { ExpandablePrompt } from '@/components/admin/llm-usage/expandable-prompt'
import { fireEvent, render, screen } from '@testing-library/react'

describe('ExpandablePrompt', () => {
  const defaultProps = {
    content: 'This is test content for the prompt',
    title: 'Test Prompt Title',
  }

  describe('Basic Rendering', () => {
    it('should render with title and content', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      expect(screen.getByText('Test Prompt Title')).toBeInTheDocument()
      expect(screen.getByText('This is test content for the prompt')).toBeInTheDocument()
    })

    it('should render expand button by default', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      expect(screen.getByText('Expand')).toBeInTheDocument()
    })

    it('should render content in a pre tag with proper styling', () => {
      const { container } = render(<ExpandablePrompt {...defaultProps} />)

      const preElement = container.querySelector('pre')
      expect(preElement).toBeInTheDocument()
      expect(preElement).toHaveClass('text-sm', 'text-foreground', 'whitespace-pre-wrap', 'font-mono')
    })

    it('should render with character count when provided', () => {
      render(
        <ExpandablePrompt
          {...defaultProps}
          characterCount={1500}
        />
      )

      expect(screen.getByText('1,500 characters')).toBeInTheDocument()
    })

    it('should render with character count suffix when provided', () => {
      render(
        <ExpandablePrompt
          {...defaultProps}
          characterCount={1500}
          characterCountSuffix="(estimated)"
        />
      )

      expect(screen.getByText('1,500 characters (estimated)')).toBeInTheDocument()
    })

    it('should not render character count when not provided', () => {
      const { container } = render(<ExpandablePrompt {...defaultProps} />)

      const characterCountElement = container.querySelector('.text-xs.text-slate-500')
      expect(characterCountElement).not.toBeInTheDocument()
    })
  })

  describe('Expand/Collapse Functionality', () => {
    it('should toggle to collapse state when expand button is clicked', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      const button = screen.getByText('Expand')
      fireEvent.click(button)

      expect(screen.getByText('Collapse')).toBeInTheDocument()
      expect(screen.queryByText('Expand')).not.toBeInTheDocument()
    })

    it('should toggle back to expand state when collapse button is clicked', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      const expandButton = screen.getByText('Expand')
      fireEvent.click(expandButton)

      const collapseButton = screen.getByText('Collapse')
      fireEvent.click(collapseButton)

      expect(screen.getByText('Expand')).toBeInTheDocument()
      expect(screen.queryByText('Collapse')).not.toBeInTheDocument()
    })

    it('should report the expanded state on the button', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(button)

      expect(button).toHaveAttribute('aria-expanded', 'true')
    })

    it('should apply correct max-height class when collapsed', () => {
      const { container } = render(<ExpandablePrompt {...defaultProps} />)

      const contentDiv = container.querySelector('.max-h-\\[300px\\]')
      expect(contentDiv).toBeInTheDocument()
    })

    it('should apply correct max-height class when expanded', () => {
      const { container } = render(<ExpandablePrompt {...defaultProps} />)

      const button = screen.getByText('Expand')
      fireEvent.click(button)

      const contentDiv = container.querySelector('.max-h-\\[5000px\\]')
      expect(contentDiv).toBeInTheDocument()
    })
  })

  describe('Content Handling', () => {
    it('should render multiline content correctly', () => {
      const multilineContent = 'Line 1\nLine 2\nLine 3'
      const { container } = render(<ExpandablePrompt {...defaultProps} content={multilineContent} />)

      const preElement = container.querySelector('pre')
      expect(preElement).toBeInTheDocument()
      expect(preElement?.textContent).toBe(multilineContent)
    })

    it('should render empty content', () => {
      const { container } = render(<ExpandablePrompt {...defaultProps} content="" />)

      const preElement = container.querySelector('pre')
      expect(preElement).toBeInTheDocument()
      expect(preElement?.textContent).toBe('')
    })

    it('should render long content', () => {
      const longContent = 'A'.repeat(10000)
      const { container } = render(<ExpandablePrompt {...defaultProps} content={longContent} />)

      const preElement = container.querySelector('pre')
      expect(preElement).toBeInTheDocument()
      expect(preElement?.textContent).toBe(longContent)
    })

    it('should preserve whitespace in content', () => {
      const contentWithSpaces = '  Indented content  '
      const { container } = render(<ExpandablePrompt {...defaultProps} content={contentWithSpaces} />)

      const preElement = container.querySelector('pre')
      expect(preElement).toBeInTheDocument()
      expect(preElement?.textContent).toBe(contentWithSpaces)
    })
  })

  describe('Styling and Layout', () => {
    it('should render inside a Card', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      const card = screen.getByTestId('expandable-prompt-Test Prompt Title')
      expect(card).toHaveClass('bg-card', 'border', 'rounded-lg', 'mb-6')
    })

    it('should render the title as a heading', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      expect(screen.getByRole('heading', { level: 2, name: 'Test Prompt Title' })).toBeInTheDocument()
    })

    it('should have proper button styling', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      const button = screen.getByRole('button')
      // Check that button is styled (has classes)
      expect(button.className).toBeTruthy()
      expect(button.className.length).toBeGreaterThan(0)
    })

    it('should have proper content container styling', () => {
      const { container } = render(<ExpandablePrompt {...defaultProps} />)

      const contentContainer = container.querySelector('.bg-secondary')
      expect(contentContainer).toBeInTheDocument()
      expect(contentContainer).toHaveClass('rounded-lg', 'p-4', 'overflow-x-auto', 'transition-all')
    })
  })

  describe('Character Count Formatting', () => {
    it('should format character count with commas', () => {
      render(
        <ExpandablePrompt
          {...defaultProps}
          characterCount={1234567}
        />
      )

      expect(screen.getByText('1,234,567 characters')).toBeInTheDocument()
    })

    it('should handle zero character count', () => {
      render(
        <ExpandablePrompt
          {...defaultProps}
          characterCount={0}
        />
      )

      expect(screen.getByText('0 characters')).toBeInTheDocument()
    })

    it('should handle single digit character count', () => {
      render(
        <ExpandablePrompt
          {...defaultProps}
          characterCount={5}
        />
      )

      expect(screen.getByText('5 characters')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid expand/collapse clicks', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      const button = screen.getByRole('button')

      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)

      expect(screen.getByText('Collapse')).toBeInTheDocument()
    })

    it('should handle special characters in content', () => {
      const specialContent = '<script>alert("test")</script>'
      const { container } = render(<ExpandablePrompt {...defaultProps} content={specialContent} />)

      const preElement = container.querySelector('pre')
      expect(preElement?.textContent).toBe(specialContent)
    })

    it('should handle unicode characters in content', () => {
      const unicodeContent = '🎬 Movie Time! 🍿'
      const { container } = render(<ExpandablePrompt {...defaultProps} content={unicodeContent} />)

      const preElement = container.querySelector('pre')
      expect(preElement?.textContent).toBe(unicodeContent)
    })

    it('should handle empty title', () => {
      render(<ExpandablePrompt {...defaultProps} title="" />)

      const titleElement = screen.queryByText('Test Prompt Title')
      expect(titleElement).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have a clickable button element', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(button.tagName).toBe('BUTTON')
    })

    it('should draw the title in the foreground token', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      const title = screen.getByText('Test Prompt Title')
      expect(title).toHaveClass('text-foreground')
    })

    it('should maintain focus after clicking expand/collapse', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      const button = screen.getByRole('button')
      button.focus()

      fireEvent.click(button)

      expect(document.activeElement).toBe(button)
    })
  })

  describe('Integration', () => {
    it('should work with all props combined', () => {
      render(
        <ExpandablePrompt
          content="Full integration test content"
          title="Integration Test"
          characterCount={25}
          characterCountSuffix="(test)"
        />
      )

      expect(screen.getByText('Integration Test')).toBeInTheDocument()
      expect(screen.getByText('Full integration test content')).toBeInTheDocument()
      expect(screen.getByText('25 characters (test)')).toBeInTheDocument()
      expect(screen.getByText('Expand')).toBeInTheDocument()
    })

    it('should maintain state through multiple interactions', () => {
      render(<ExpandablePrompt {...defaultProps} />)

      // Expand
      fireEvent.click(screen.getByText('Expand'))
      expect(screen.getByText('Collapse')).toBeInTheDocument()

      // Collapse
      fireEvent.click(screen.getByText('Collapse'))
      expect(screen.getByText('Expand')).toBeInTheDocument()

      // Expand again
      fireEvent.click(screen.getByText('Expand'))
      expect(screen.getByText('Collapse')).toBeInTheDocument()
    })
  })
})

