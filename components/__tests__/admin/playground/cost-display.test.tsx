import { CostDisplay } from "@/components/admin/playground/cost-display"
import { render, screen } from "@testing-library/react"

describe("CostDisplay", () => {
  const mockTokenUsage = {
    promptTokens: 1500,
    completionTokens: 500,
    totalTokens: 2000,
    cost: 0.0234,
  }

  describe("Basic Rendering", () => {
    it("should render nothing when tokenUsage is undefined", () => {
      const { container } = render(
        <CostDisplay
          tokenUsage={undefined}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(container.firstChild).toBeNull()
    })

    it("should render cost display when tokenUsage is provided", () => {
      render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("Actual Cost")).toBeInTheDocument()
      expect(screen.getByText("$0.0234")).toBeInTheDocument()
    })

    it("should display all token metrics", () => {
      render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("1,500")).toBeInTheDocument()
      expect(screen.getByText("500")).toBeInTheDocument()
      expect(screen.getByText("2,000")).toBeInTheDocument()
    })

    it("should display model name", () => {
      render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("gpt-4")).toBeInTheDocument()
    })

    it("should display confirmation message", () => {
      render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(
        screen.getByText("✓ This cost has been recorded in the cost analysis dashboard")
      ).toBeInTheDocument()
    })
  })

  describe("Model Selection", () => {
    it("should use selectedModel when provided", () => {
      render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-4"
          selectedModel="gpt-4-turbo"
        />
      )

      expect(screen.getByText("gpt-4-turbo")).toBeInTheDocument()
    })

    it("should use configuredModel when selectedModel is not provided", () => {
      render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-3.5-turbo"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("gpt-3.5-turbo")).toBeInTheDocument()
    })

    it("should default to the current default model when no model is provided", () => {
      render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel=""
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("gpt-5.4-mini")).toBeInTheDocument()
    })
  })

  describe("Cost Formatting", () => {
    it("should format cost to 4 decimal places", () => {
      render(
        <CostDisplay
          tokenUsage={{ ...mockTokenUsage, cost: 0.123456 }}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("$0.1235")).toBeInTheDocument()
    })

    it("should format very small costs correctly", () => {
      render(
        <CostDisplay
          tokenUsage={{ ...mockTokenUsage, cost: 0.0001 }}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("$0.0001")).toBeInTheDocument()
    })

    it("should format zero cost correctly", () => {
      render(
        <CostDisplay
          tokenUsage={{ ...mockTokenUsage, cost: 0 }}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("$0.0000")).toBeInTheDocument()
    })
  })

  describe("Token Number Formatting", () => {
    it("should format large token numbers with commas", () => {
      render(
        <CostDisplay
          tokenUsage={{
            promptTokens: 123456,
            completionTokens: 78901,
            totalTokens: 202357,
            cost: 1.5,
          }}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("123,456")).toBeInTheDocument()
      expect(screen.getByText("78,901")).toBeInTheDocument()
      expect(screen.getByText("202,357")).toBeInTheDocument()
    })

    it("should handle single digit token counts", () => {
      render(
        <CostDisplay
          tokenUsage={{
            promptTokens: 5,
            completionTokens: 3,
            totalTokens: 8,
            cost: 0.0001,
          }}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("5")).toBeInTheDocument()
      expect(screen.getByText("3")).toBeInTheDocument()
      expect(screen.getByText("8")).toBeInTheDocument()
    })
  })

  describe("Visual Elements", () => {
    it("should render with gradient background", () => {
      const { container } = render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      const gradientDiv = container.querySelector(".bg-gradient-to-r")
      expect(gradientDiv).toBeInTheDocument()
      expect(gradientDiv).toHaveClass("from-green-500/10", "to-emerald-500/10")
    })

    it("should render cost icon", () => {
      const { container } = render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      const svg = container.querySelector("svg")
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass("text-purple-400")
    })

    it("should have proper styling for different token types", () => {
      const { container } = render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      // Check for cyan color on prompt tokens
      const promptTokensElement = screen.getByText("1,500")
      expect(promptTokensElement).toHaveClass("text-cyan-400")

      // Check for purple color on completion tokens
      const completionTokensElement = screen.getByText("500")
      expect(completionTokensElement).toHaveClass("text-purple-400")

      // Check for white color on total tokens
      const totalTokensElement = screen.getByText("2,000")
      expect(totalTokensElement).toHaveClass("text-white")
    })
  })

  describe("Labels", () => {
    it("should display all required labels", () => {
      render(
        <CostDisplay
          tokenUsage={mockTokenUsage}
          configuredModel="gpt-4"
          selectedModel={undefined}
        />
      )

      expect(screen.getByText("Model")).toBeInTheDocument()
      expect(screen.getByText("Prompt Tokens")).toBeInTheDocument()
      expect(screen.getByText("Completion Tokens")).toBeInTheDocument()
      expect(screen.getByText("Total Tokens")).toBeInTheDocument()
      expect(screen.getByText("Cost")).toBeInTheDocument()
    })
  })
})

