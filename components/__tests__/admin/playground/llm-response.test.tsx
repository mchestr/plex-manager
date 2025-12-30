import { LLMResponse } from "@/components/admin/playground/llm-response"
import { fireEvent, render, screen } from "@testing-library/react"
import React from 'react'

// Mock the toast to prevent infinite loops and timeouts
const mockShowError = jest.fn()
const mockShowSuccess = jest.fn()
const mockShowInfo = jest.fn()
const mockShowToast = jest.fn()

jest.mock('@/components/ui/sonner', () => {
  const actual = jest.requireActual('@/components/ui/sonner')
  return {
    ...actual,
    useToast: () => ({
      showToast: mockShowToast,
      showSuccess: mockShowSuccess,
      showError: mockShowError,
      showInfo: mockShowInfo,
    }),
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

describe("LLMResponse", () => {
  const mockProps = {
    llmResponse: "This is a test LLM response with some content",
    onPreview: jest.fn(),
    onSave: jest.fn(),
    isSaving: false,
    saveError: null,
    previewError: null,
  }

  const renderWithToast = (component: React.ReactElement) => {
    return render(component)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockShowError.mockClear()
    mockShowSuccess.mockClear()
    mockShowInfo.mockClear()
    mockShowToast.mockClear()
  })

  describe("Basic Rendering", () => {
    it("should render the component with llm response", () => {
      renderWithToast(<LLMResponse {...mockProps} />)

      expect(screen.getByText("LLM Response")).toBeInTheDocument()
      expect(
        screen.getByText("The AI-generated response containing the wrapped data")
      ).toBeInTheDocument()
      expect(screen.getByText(mockProps.llmResponse)).toBeInTheDocument()
    })

    it("should render preview button", () => {
      renderWithToast(<LLMResponse {...mockProps} />)

      const previewButton = screen.getByRole("button", { name: /preview/i })
      expect(previewButton).toBeInTheDocument()
    })

    it("should render save button", () => {
      renderWithToast(<LLMResponse {...mockProps} />)

      const saveButton = screen.getByRole("button", { name: /save as wrapped/i })
      expect(saveButton).toBeInTheDocument()
    })

    it("should display llm response in pre element", () => {
      const { container } = renderWithToast(<LLMResponse {...mockProps} />)

      const preElement = container.querySelector("pre")
      expect(preElement).toBeInTheDocument()
      expect(preElement).toHaveTextContent(mockProps.llmResponse)
    })
  })

  describe("Button Interactions", () => {
    it("should call onPreview when preview button is clicked", () => {
      renderWithToast(<LLMResponse {...mockProps} />)

      const previewButton = screen.getByRole("button", { name: /preview/i })
      fireEvent.click(previewButton)

      expect(mockProps.onPreview).toHaveBeenCalledTimes(1)
    })

    it("should call onSave when save button is clicked", () => {
      renderWithToast(<LLMResponse {...mockProps} />)

      const saveButton = screen.getByRole("button", { name: /save as wrapped/i })
      fireEvent.click(saveButton)

      expect(mockProps.onSave).toHaveBeenCalledTimes(1)
    })

    it("should not call onSave when button is disabled", () => {
      renderWithToast(<LLMResponse {...mockProps} isSaving={true} />)

      const saveButton = screen.getByRole("button", { name: /saving/i })
      fireEvent.click(saveButton)

      expect(mockProps.onSave).not.toHaveBeenCalled()
    })
  })

  describe("Saving State", () => {
    it("should disable save button when isSaving is true", () => {
      renderWithToast(<LLMResponse {...mockProps} isSaving={true} />)

      const saveButton = screen.getByRole("button", { name: /saving/i })
      expect(saveButton).toBeDisabled()
    })

    it("should show saving text when isSaving is true", () => {
      renderWithToast(<LLMResponse {...mockProps} isSaving={true} />)

      expect(screen.getByText("Saving...")).toBeInTheDocument()
    })

    it("should show save icon when not saving", () => {
      const { container } = renderWithToast(<LLMResponse {...mockProps} isSaving={false} />)

      const saveButton = screen.getByRole("button", { name: /save as wrapped/i })
      const svg = saveButton.querySelector("svg")
      expect(svg).toBeInTheDocument()
    })

    it("should show spinner when saving", () => {
      const { container } = renderWithToast(<LLMResponse {...mockProps} isSaving={true} />)

      const saveButton = screen.getByRole("button", { name: /saving/i })
      const spinner = saveButton.querySelector(".animate-spin")
      expect(spinner).toBeInTheDocument()
    })
  })

  describe("Error Handling", () => {
    it("should display save error when provided", () => {
      renderWithToast(<LLMResponse {...mockProps} saveError="Failed to save wrapped data" />)

      // Error is shown as toast, not in UI
      expect(mockShowError).toHaveBeenCalledWith("Failed to save wrapped data")
    })

    it("should display preview error when provided", () => {
      renderWithToast(<LLMResponse {...mockProps} previewError="Failed to preview wrapped data" />)

      // Error is shown as toast, not in UI
      expect(mockShowError).toHaveBeenCalledWith("Failed to preview wrapped data")
    })

    it("should display both errors when both are provided", () => {
      renderWithToast(
        <LLMResponse
          {...mockProps}
          saveError="Save error"
          previewError="Preview error"
        />
      )

      // Errors are shown as toasts, not in UI
      expect(mockShowError).toHaveBeenCalledWith("Save error")
      expect(mockShowError).toHaveBeenCalledWith("Preview error")
    })

    it("should not display error messages when errors are null", () => {
      renderWithToast(<LLMResponse {...mockProps} saveError={null} previewError={null} />)

      // No toasts should be called
      expect(mockShowError).not.toHaveBeenCalled()
    })

    it("should show error as toast when saveError is provided", () => {
      renderWithToast(
        <LLMResponse {...mockProps} saveError="Test error" />
      )

      // Error is shown as toast
      expect(mockShowError).toHaveBeenCalledWith("Test error")
    })
  })

  describe("Visual Elements", () => {
    it("should render with proper styling classes", () => {
      const { container } = renderWithToast(<LLMResponse {...mockProps} />)

      const mainDiv = container.querySelector(".bg-slate-800\\/50")
      expect(mainDiv).toBeInTheDocument()
      expect(mainDiv).toHaveClass("backdrop-blur-sm", "border", "border-slate-700/50")
    })

    it("should render icon for LLM Response header", () => {
      const { container } = renderWithToast(<LLMResponse {...mockProps} />)

      const svg = container.querySelector("svg")
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass("text-cyan-400")
    })

    it("should render response in scrollable container", () => {
      const { container } = renderWithToast(<LLMResponse {...mockProps} />)

      const scrollableDiv = container.querySelector(".max-h-96")
      expect(scrollableDiv).toBeInTheDocument()
      expect(scrollableDiv).toHaveClass("overflow-y-auto")
    })
  })

  describe("Button Styling", () => {
    it("should style preview button with cyan-purple gradient", () => {
      renderWithToast(<LLMResponse {...mockProps} />)

      const previewButton = screen.getByRole("button", { name: /preview/i })
      expect(previewButton).toHaveClass("bg-gradient-to-r", "from-cyan-600", "to-purple-600")
    })

    it("should style save button with green-emerald gradient", () => {
      renderWithToast(<LLMResponse {...mockProps} />)

      const saveButton = screen.getByRole("button", { name: /save as wrapped/i })
      expect(saveButton).toHaveClass("bg-gradient-to-r", "from-green-600", "to-emerald-600")
    })

    it("should apply disabled styling when saving", () => {
      renderWithToast(<LLMResponse {...mockProps} isSaving={true} />)

      const saveButton = screen.getByRole("button", { name: /saving/i })
      expect(saveButton).toHaveClass("disabled:opacity-50", "disabled:cursor-not-allowed")
    })
  })

  describe("Long Content", () => {
    it("should handle very long llm responses", () => {
      const longResponse = "A".repeat(10000)
      renderWithToast(<LLMResponse {...mockProps} llmResponse={longResponse} />)

      expect(screen.getByText(longResponse)).toBeInTheDocument()
    })

    it("should preserve whitespace in response", () => {
      const responseWithWhitespace = "Line 1\n\nLine 2\n  Indented Line 3"
      const { container } = renderWithToast(
        <LLMResponse {...mockProps} llmResponse={responseWithWhitespace} />
      )

      const preElement = container.querySelector("pre")
      expect(preElement).toHaveClass("whitespace-pre-wrap")
    })
  })
})

