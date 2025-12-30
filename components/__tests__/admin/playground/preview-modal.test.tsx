import { PreviewModal } from "@/components/admin/playground/preview-modal"
import { WrappedData } from "@/types/wrapped"
import { fireEvent, render, screen } from "@testing-library/react"

// Mock the WrappedViewerWrapper component
jest.mock("@/components/wrapped/wrapped-viewer-wrapper", () => ({
  WrappedViewerWrapper: ({ wrappedData, year, userName }: any) => (
    <div data-testid="wrapped-viewer-wrapper">
      <div>User: {userName}</div>
      <div>Year: {year}</div>
      <div>Data: {JSON.stringify(wrappedData)}</div>
    </div>
  ),
}))

describe("PreviewModal", () => {
  const mockWrappedData: WrappedData = {
    totalWatchTime: { hours: 100, minutes: 30 },
    moviesWatched: 50,
    showsWatched: 20,
    episodesWatched: 150,
    topMovies: [],
    topShows: [],
    topGenres: [],
    insights: [],
    summary: "Test summary",
  }

  const mockProps = {
    show: true,
    wrappedData: mockWrappedData,
    userName: "TestUser",
    year: 2024,
    onClose: jest.fn(),
    onSave: jest.fn(),
    isSaving: false,
    saveError: null,
    canSave: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock document.body for portal
    document.body.innerHTML = '<div id="root"></div>'
  })

  describe("Visibility", () => {
    it("should render when show is true", () => {
      render(<PreviewModal {...mockProps} />)

      expect(screen.getByText(/Preview:/)).toBeInTheDocument()
    })

    it("should not render when show is false", () => {
      render(<PreviewModal {...mockProps} show={false} />)

      expect(screen.queryByText(/Preview:/)).not.toBeInTheDocument()
    })

    it("should not render when wrappedData is null", () => {
      render(<PreviewModal {...mockProps} wrappedData={null} />)

      expect(screen.queryByText(/Preview:/)).not.toBeInTheDocument()
    })
  })

  describe("Header Content", () => {
    it("should display user name and year in header", () => {
      render(<PreviewModal {...mockProps} />)

      expect(screen.getByText("Preview: TestUser's 2024 Wrapped")).toBeInTheDocument()
    })

    it("should display preview description", () => {
      render(<PreviewModal {...mockProps} />)

      expect(
        screen.getByText(
          "This is a preview. Use the buttons below to save or go back to the playground."
        )
      ).toBeInTheDocument()
    })
  })

  describe("Button Interactions", () => {
    it("should call onClose when back button is clicked", () => {
      render(<PreviewModal {...mockProps} />)

      const backButton = screen.getByRole("button", { name: /back to playground/i })
      fireEvent.click(backButton)

      expect(mockProps.onClose).toHaveBeenCalledTimes(1)
    })

    it("should call onSave when save button is clicked", () => {
      render(<PreviewModal {...mockProps} />)

      const saveButton = screen.getByRole("button", { name: /save as wrapped/i })
      fireEvent.click(saveButton)

      expect(mockProps.onSave).toHaveBeenCalledTimes(1)
    })

    it("should not call onSave when button is disabled", () => {
      render(<PreviewModal {...mockProps} isSaving={true} />)

      const saveButton = screen.getByRole("button", { name: /saving/i })
      fireEvent.click(saveButton)

      expect(mockProps.onSave).not.toHaveBeenCalled()
    })
  })

  describe("Save Button State", () => {
    it("should disable save button when isSaving is true", () => {
      render(<PreviewModal {...mockProps} isSaving={true} />)

      const saveButton = screen.getByRole("button", { name: /saving/i })
      expect(saveButton).toBeDisabled()
    })

    it("should disable save button when canSave is false", () => {
      render(<PreviewModal {...mockProps} canSave={false} />)

      const saveButton = screen.getByRole("button", { name: /save as wrapped/i })
      expect(saveButton).toBeDisabled()
    })

    it("should show saving text when isSaving is true", () => {
      render(<PreviewModal {...mockProps} isSaving={true} />)

      expect(screen.getByText("Saving...")).toBeInTheDocument()
    })

    it("should show save text when not saving", () => {
      render(<PreviewModal {...mockProps} isSaving={false} />)

      expect(screen.getByText("Save as Wrapped")).toBeInTheDocument()
    })

    it("should show spinner when saving", () => {
      render(<PreviewModal {...mockProps} isSaving={true} />)

      const saveButton = screen.getByRole("button", { name: /saving/i })
      const svg = saveButton.querySelector("svg")
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass("animate-spin")
    })
  })

  describe("Error Display", () => {
    it("should display save error when provided", () => {
      render(<PreviewModal {...mockProps} saveError="Failed to save" />)

      expect(screen.getByText("Failed to save")).toBeInTheDocument()
    })

    it("should not display error when saveError is null", () => {
      render(<PreviewModal {...mockProps} saveError={null} />)

      const errorElements = screen.queryAllByText(/failed/i)
      expect(errorElements).toHaveLength(0)
    })

    it("should style error message with red background", () => {
      render(<PreviewModal {...mockProps} saveError="Test error" />)

      const errorDiv = document.body.querySelector(".bg-red-500\\/10")
      expect(errorDiv).toBeInTheDocument()
      if (errorDiv) {
        expect(errorDiv.classList.contains("border-red-500/50") || errorDiv.classList.contains("text-red-400")).toBe(true)
      }
    })
  })

  describe("Wrapped Viewer Integration", () => {
    it("should render WrappedViewerWrapper with correct props", () => {
      render(<PreviewModal {...mockProps} />)

      const wrapper = screen.getByTestId("wrapped-viewer-wrapper")
      expect(wrapper).toBeInTheDocument()
      expect(screen.getByText("User: TestUser")).toBeInTheDocument()
      expect(screen.getByText("Year: 2024")).toBeInTheDocument()
    })

    it("should pass wrappedData to viewer", () => {
      render(<PreviewModal {...mockProps} />)

      const dataText = screen.getByText(/Data:/)
      expect(dataText).toBeInTheDocument()
    })
  })

  describe("Modal Styling", () => {
    it("should render with full screen overlay", () => {
      render(<PreviewModal {...mockProps} />)

      const overlay = document.body.querySelector(".fixed.inset-0")
      expect(overlay).toBeInTheDocument()
      expect(overlay).toHaveClass("bg-black/90", "backdrop-blur-sm")
    })

    it("should render header with sticky positioning", () => {
      render(<PreviewModal {...mockProps} />)

      const header = document.body.querySelector(".sticky.top-0")
      expect(header).toBeInTheDocument()
      expect(header).toHaveClass("bg-slate-900/90", "backdrop-blur-sm")
    })

    it("should have proper z-index for modal", () => {
      render(<PreviewModal {...mockProps} />)

      const modal = document.body.querySelector(".z-\\[9999\\]")
      expect(modal).toBeInTheDocument()
    })
  })

  describe("Button Rendering", () => {
    it("should render save button", () => {
      render(<PreviewModal {...mockProps} />)

      const saveButton = screen.getByRole("button", { name: /save as wrapped/i })
      expect(saveButton).toBeInTheDocument()
      expect(saveButton).not.toBeDisabled()
    })

    it("should render back button", () => {
      render(<PreviewModal {...mockProps} />)

      const backButton = screen.getByRole("button", { name: /back to playground/i })
      expect(backButton).toBeInTheDocument()
    })
  })

  describe("Different User Names", () => {
    it("should handle user name with special characters", () => {
      render(<PreviewModal {...mockProps} userName="User's Name" />)

      expect(screen.getByText("Preview: User's Name's 2024 Wrapped")).toBeInTheDocument()
    })

    it("should handle long user names", () => {
      const longName = "A".repeat(50)
      render(<PreviewModal {...mockProps} userName={longName} />)

      expect(screen.getByText(`Preview: ${longName}'s 2024 Wrapped`)).toBeInTheDocument()
    })
  })

  describe("Different Years", () => {
    it("should display year 2023", () => {
      render(<PreviewModal {...mockProps} year={2023} />)

      expect(screen.getByText("Preview: TestUser's 2023 Wrapped")).toBeInTheDocument()
    })

    it("should display year 2025", () => {
      render(<PreviewModal {...mockProps} year={2025} />)

      expect(screen.getByText("Preview: TestUser's 2025 Wrapped")).toBeInTheDocument()
    })
  })

  describe("Portal Rendering", () => {
    it("should render into document.body", () => {
      render(<PreviewModal {...mockProps} />)

      // Check that the modal is appended to body
      const modal = document.body.querySelector(".fixed.inset-0")
      expect(modal).toBeInTheDocument()
    })
  })

  describe("Icons", () => {
    it("should render save icon in save button", () => {
      const { container } = render(<PreviewModal {...mockProps} />)

      const saveButton = screen.getByRole("button", { name: /save as wrapped/i })
      const svg = saveButton.querySelector("svg")
      expect(svg).toBeInTheDocument()
    })

    it("should render back icon in back button", () => {
      const { container } = render(<PreviewModal {...mockProps} />)

      const backButton = screen.getByRole("button", { name: /back to playground/i })
      const svg = backButton.querySelector("svg")
      expect(svg).toBeInTheDocument()
    })
  })
})

