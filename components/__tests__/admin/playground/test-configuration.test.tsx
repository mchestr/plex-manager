import { TestConfiguration } from "@/components/admin/playground/test-configuration"
import { WrappedStatistics } from "@/types/wrapped"
import { fireEvent, render, screen } from "@testing-library/react"

// Mock child components
jest.mock("@/components/admin/playground/statistics-viewer", () => ({
  StatisticsViewer: ({ statistics, viewMode }: any) => (
    <div data-testid="statistics-viewer">
      Statistics Viewer - Mode: {viewMode}
    </div>
  ),
}))

jest.mock("@/components/ui/select", () => ({
  StyledDropdown: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string
    onChange: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder?: string
  }) => (
    <select
      data-testid="styled-dropdown"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}))

jest.mock("@/components/ui/input", () => ({
  StyledInput: ({
    type,
    value,
    onChange,
    placeholder,
    min,
    max,
    step,
  }: {
    type: string
    value: string | number
    onChange: (e: any) => void
    placeholder?: string
    min?: string
    max?: string
    step?: string
  }) => (
    <input
      data-testid="styled-input"
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
    />
  ),
}))

describe("TestConfiguration", () => {
  const mockPlexUsers = [
    {
      id: "user-1",
      name: "TestUser1",
      email: "test1@example.com",
      thumb: undefined,
      restricted: false,
      serverAdmin: true,
    },
    {
      id: "user-2",
      name: "TestUser2",
      email: undefined,
      thumb: undefined,
      restricted: false,
      serverAdmin: false,
    },
  ]

  const mockModels = ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"]

  const mockStatistics: WrappedStatistics = {
    totalWatchTime: { total: 36000, movies: 18000, shows: 18000 },
    moviesWatched: 50,
    showsWatched: 20,
    episodesWatched: 150,
    topMovies: [],
    topShows: [],
    topGenres: [],
  }

  const mockProps = {
    testConfig: {
      userName: "TestUser1",
      year: 2024,
      model: "",
      temperature: undefined,
      maxTokens: undefined,
    },
    onTestConfigChange: jest.fn(),
    plexUsers: mockPlexUsers,
    loadingUsers: false,
    models: mockModels,
    loadingModels: false,
    configuredModel: "gpt-4",
    useCustomModel: false,
    onUseCustomModelChange: jest.fn(),
    statistics: mockStatistics,
    loadingStatistics: false,
    statisticsError: null,
    showStatistics: false,
    onShowStatisticsChange: jest.fn(),
    statisticsViewMode: "formatted" as const,
    onStatisticsViewModeChange: jest.fn(),
    showAIParameters: false,
    onShowAIParametersChange: jest.fn(),
    onRenderTemplate: jest.fn(),
    onGenerateResponse: jest.fn(),
    isPending: false,
    costEstimate: undefined,
    tokenUsage: undefined,
    selectedModel: undefined,
    onReset: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Basic Rendering", () => {
    it("should render the component", () => {
      render(<TestConfiguration {...mockProps} />)

      expect(screen.getByText("Test Configuration")).toBeInTheDocument()
      expect(
        screen.getByText("Configure user, year, and AI parameters for testing")
      ).toBeInTheDocument()
    })

    it("should render user name dropdown", () => {
      render(<TestConfiguration {...mockProps} />)

      expect(screen.getByText("User Name")).toBeInTheDocument()
    })

    it("should render year input", () => {
      render(<TestConfiguration {...mockProps} />)

      expect(screen.getByText("Year")).toBeInTheDocument()
    })

    it("should render reset button", () => {
      render(<TestConfiguration {...mockProps} />)

      expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument()
    })
  })

  describe("User Selection", () => {
    it("should display loading state for users", () => {
      render(<TestConfiguration {...mockProps} loadingUsers={true} />)

      expect(screen.getByText("Loading users...")).toBeInTheDocument()
    })

    it("should call onTestConfigChange when user is selected", () => {
      render(<TestConfiguration {...mockProps} />)

      const dropdown = screen.getAllByTestId("styled-dropdown")[0]
      fireEvent.change(dropdown, { target: { value: "TestUser2" } })

      expect(mockProps.onTestConfigChange).toHaveBeenCalledWith({ userName: "TestUser2" })
    })
  })

  describe("Year Input", () => {
    it("should display current year", () => {
      render(<TestConfiguration {...mockProps} />)

      const inputs = screen.getAllByTestId("styled-input")
      const yearInput = inputs.find((input) => input.getAttribute("type") === "number")
      expect(yearInput).toHaveValue(2024)
    })

    it("should call onTestConfigChange when year is changed", () => {
      render(<TestConfiguration {...mockProps} />)

      const inputs = screen.getAllByTestId("styled-input")
      const yearInput = inputs.find((input) => input.getAttribute("type") === "number")
      fireEvent.change(yearInput!, { target: { value: "2023" } })

      expect(mockProps.onTestConfigChange).toHaveBeenCalledWith({ year: 2023 })
    })
  })

  describe("AI Parameters Section", () => {
    it("should not show AI parameters by default", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={false} />)

      expect(screen.queryByText(/Model/)).not.toBeInTheDocument()
    })

    it("should show AI parameters when expanded", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} />)

      expect(screen.getByText(/Model/)).toBeInTheDocument()
      expect(screen.getByText(/Temperature/)).toBeInTheDocument()
      expect(screen.getByText(/Max Tokens/)).toBeInTheDocument()
    })

    it("should toggle AI parameters when button is clicked", () => {
      render(<TestConfiguration {...mockProps} />)

      const toggleButton = screen.getByText("AI Parameters").closest("button")
      fireEvent.click(toggleButton!)

      expect(mockProps.onShowAIParametersChange).toHaveBeenCalledWith(true)
    })

    it("should rotate chevron when expanded", () => {
      const { container } = render(
        <TestConfiguration {...mockProps} showAIParameters={true} />
      )

      const chevron = container.querySelector(".rotate-180")
      expect(chevron).toBeInTheDocument()
    })
  })

  describe("Model Selection", () => {
    it("should display loading state for models", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} loadingModels={true} />)

      expect(screen.getByText("Loading models...")).toBeInTheDocument()
    })

    it("should show model dropdown when not using custom model", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} useCustomModel={false} />)

      const dropdowns = screen.getAllByTestId("styled-dropdown")
      expect(dropdowns.length).toBeGreaterThan(0)
    })

    it("should show custom model input when using custom model", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} useCustomModel={true} />)

      expect(screen.getByPlaceholderText(/Enter custom model name/)).toBeInTheDocument()
    })

    it("should switch to custom model input when __custom__ is selected", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} useCustomModel={false} />)

      const modelDropdown = screen.getAllByTestId("styled-dropdown").find((el) =>
        el.closest("div")?.textContent?.includes("Model")
      )
      fireEvent.change(modelDropdown!, { target: { value: "__custom__" } })

      expect(mockProps.onUseCustomModelChange).toHaveBeenCalledWith(true)
      expect(mockProps.onTestConfigChange).toHaveBeenCalledWith({ model: "" })
    })

    it("should show back to model list button when using custom model", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} useCustomModel={true} />)

      expect(screen.getByText("← Back to model list")).toBeInTheDocument()
    })
  })

  describe("Statistics Display", () => {
    it("should show loading message when loading statistics", () => {
      render(<TestConfiguration {...mockProps} loadingStatistics={true} />)

      expect(screen.getByText(/Loading statistics for/)).toBeInTheDocument()
    })

    it("should show error message when statistics error occurs", () => {
      render(<TestConfiguration {...mockProps} statisticsError="Failed to load" />)

      expect(screen.getByText("Error loading statistics: Failed to load")).toBeInTheDocument()
    })

    it("should show success message when statistics are loaded", () => {
      render(<TestConfiguration {...mockProps} statistics={mockStatistics} />)

      expect(screen.getByText(/✓ Statistics loaded for/)).toBeInTheDocument()
    })

    it("should toggle statistics viewer when button is clicked", () => {
      render(<TestConfiguration {...mockProps} statistics={mockStatistics} />)

      const viewButton = screen.getByText(/View Statistics/i).closest("button")
      fireEvent.click(viewButton!)

      expect(mockProps.onShowStatisticsChange).toHaveBeenCalledWith(true)
    })

    it("should render statistics viewer when showStatistics is true", () => {
      render(
        <TestConfiguration
          {...mockProps}
          statistics={mockStatistics}
          showStatistics={true}
        />
      )

      expect(screen.getByTestId("statistics-viewer")).toBeInTheDocument()
    })
  })

  describe("Cost Display", () => {
    it("should display cost estimate when available", () => {
      const costEstimate = {
        promptTokens: 1000,
        estimatedCompletionTokens: 500,
        totalTokens: 1500,
        cost: 0.0234,
        model: "gpt-4",
      }

      render(<TestConfiguration {...mockProps} costEstimate={costEstimate} />)

      expect(screen.getByText("Estimated Cost")).toBeInTheDocument()
      expect(screen.getByText("$0.0234")).toBeInTheDocument()
    })

    it("should display actual cost when token usage is available", () => {
      const tokenUsage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.0234,
      }

      render(<TestConfiguration {...mockProps} tokenUsage={tokenUsage} />)

      expect(screen.getByText("Actual Cost")).toBeInTheDocument()
      expect(screen.getByText("$0.0234")).toBeInTheDocument()
    })

    it("should show confirmation message for actual cost", () => {
      const tokenUsage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.0234,
      }

      render(<TestConfiguration {...mockProps} tokenUsage={tokenUsage} />)

      expect(
        screen.getByText("✓ This cost has been recorded in the cost analysis dashboard")
      ).toBeInTheDocument()
    })
  })

  describe("Action Buttons", () => {
    it("should render render template button", () => {
      render(<TestConfiguration {...mockProps} />)

      expect(screen.getByRole("button", { name: /render template/i })).toBeInTheDocument()
    })

    it("should render generate response button", () => {
      render(<TestConfiguration {...mockProps} />)

      const buttons = screen.getAllByRole("button")
      const generateButton = buttons.find((btn) => btn.textContent?.includes("Generate Response"))
      expect(generateButton).toBeInTheDocument()
    })

    it("should call onRenderTemplate when render button is clicked", () => {
      render(<TestConfiguration {...mockProps} statistics={mockStatistics} />)

      const renderButton = screen.getByRole("button", { name: /render template/i })
      fireEvent.click(renderButton)

      expect(mockProps.onRenderTemplate).toHaveBeenCalledTimes(1)
    })

    it("should call onGenerateResponse when generate button is clicked", () => {
      const { container } = render(<TestConfiguration {...mockProps} statistics={mockStatistics} />)

      const generateButton = container.querySelector(".bg-gradient-to-r.from-cyan-600") as HTMLElement
      fireEvent.click(generateButton!)

      expect(mockProps.onGenerateResponse).toHaveBeenCalledTimes(1)
    })

    it("should disable buttons when isPending is true", () => {
      render(<TestConfiguration {...mockProps} isPending={true} />)

      const buttons = screen.getAllByRole("button")
      const renderButton = buttons.find((btn) => btn.textContent?.includes("Rendering"))
      const generateButton = buttons.find((btn) => btn.textContent?.includes("Generating"))

      expect(renderButton).toBeDisabled()
      expect(generateButton).toBeDisabled()
    })

    it("should disable buttons when statistics are loading", () => {
      render(<TestConfiguration {...mockProps} loadingStatistics={true} />)

      const buttons = screen.getAllByRole("button")
      const renderButton = buttons.find((btn) => btn.textContent?.includes("Loading statistics"))
      expect(renderButton).toBeDisabled()
    })

    it("should disable buttons when statistics are not available", () => {
      render(<TestConfiguration {...mockProps} statistics={null} />)

      const buttons = screen.getAllByRole("button")
      const renderButton = buttons.find((btn) => btn.textContent?.includes("Waiting for statistics"))
      expect(renderButton).toBeDisabled()
    })

    it("should disable buttons when userName is not set", () => {
      const { container } = render(
        <TestConfiguration
          {...mockProps}
          testConfig={{ ...mockProps.testConfig, userName: "" }}
        />
      )

      const renderButton = screen.getByRole("button", { name: /render template/i })
      const generateButton = container.querySelector(".bg-gradient-to-r.from-cyan-600") as HTMLElement

      expect(renderButton).toBeDisabled()
      expect(generateButton).toHaveAttribute("disabled")
    })
  })

  describe("Reset Button", () => {
    it("should call onReset when reset button is clicked", () => {
      render(<TestConfiguration {...mockProps} />)

      const resetButton = screen.getByRole("button", { name: /reset/i })
      fireEvent.click(resetButton)

      expect(mockProps.onReset).toHaveBeenCalledTimes(1)
    })

    it("should have proper styling for reset button", () => {
      render(<TestConfiguration {...mockProps} />)

      const resetButton = screen.getByRole("button", { name: /reset/i })
      expect(resetButton).toHaveClass("border-slate-700")
    })
  })

  describe("Temperature Input", () => {
    it("should display temperature input when AI parameters are shown", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} />)

      const inputs = screen.getAllByTestId("styled-input")
      const tempInput = inputs.find((input) => input.getAttribute("step") === "0.1")
      expect(tempInput).toBeInTheDocument()
    })

    it("should call onTestConfigChange when temperature is changed", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} />)

      const inputs = screen.getAllByTestId("styled-input")
      const tempInput = inputs.find((input) => input.getAttribute("step") === "0.1")
      fireEvent.change(tempInput!, { target: { value: "0.7" } })

      expect(mockProps.onTestConfigChange).toHaveBeenCalledWith({ temperature: 0.7 })
    })

    it("should show temperature range information", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} />)

      expect(
        screen.getByText(/Range: 0.0-2.0/)
      ).toBeInTheDocument()
    })
  })

  describe("Max Tokens Input", () => {
    it("should display max tokens input when AI parameters are shown", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} />)

      const inputs = screen.getAllByPlaceholderText(/Leave empty to use configured/)
      expect(inputs.length).toBeGreaterThan(0)
    })

    it("should call onTestConfigChange when max tokens is changed", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} />)

      const inputs = screen.getAllByPlaceholderText(/Leave empty to use configured/)
      const maxTokensInput = inputs.find((input) => input.getAttribute("max") === "100000")
      fireEvent.change(maxTokensInput!, { target: { value: "8000" } })

      expect(mockProps.onTestConfigChange).toHaveBeenCalledWith({ maxTokens: 8000 })
    })
  })

  describe("Styling", () => {
    it("should have proper container styling", () => {
      const { container } = render(<TestConfiguration {...mockProps} />)

      const mainDiv = container.querySelector(".bg-slate-800\\/50")
      expect(mainDiv).toBeInTheDocument()
      expect(mainDiv).toHaveClass("backdrop-blur-sm", "border", "border-slate-700/50")
    })

    it("should style generate button with gradient", () => {
      const { container } = render(<TestConfiguration {...mockProps} />)

      const generateButton = container.querySelector(".bg-gradient-to-r.from-cyan-600")
      expect(generateButton).toBeInTheDocument()
      expect(generateButton).toHaveClass("to-purple-600")
    })
  })

  describe("Edge Cases", () => {
    it("should handle empty user list", () => {
      render(<TestConfiguration {...mockProps} plexUsers={[]} />)

      expect(screen.getByText("User Name")).toBeInTheDocument()
    })

    it("should handle empty model list", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} models={[]} />)

      expect(screen.getByText(/Model/)).toBeInTheDocument()
    })

    it("should handle missing configured model", () => {
      render(<TestConfiguration {...mockProps} showAIParameters={true} configuredModel="" />)

      expect(screen.getByText(/Model/)).toBeInTheDocument()
    })
  })
})

