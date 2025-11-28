import { WrappedPlayground } from "@/components/admin/playground/wrapped-playground"
import { PromptTemplate } from "@/lib/generated/prisma/client"
import { act, render, screen, waitFor } from "@testing-library/react"

// Mock wrapped library functions
jest.mock("@/lib/wrapped/pricing", () => ({
  estimateCost: jest.fn(() => ({
    promptTokens: 1000,
    estimatedCompletionTokens: 500,
    totalTokens: 1500,
    cost: 0.0234,
  })),
}))

jest.mock("@/lib/wrapped/prompt", () => ({
  parseWrappedResponse: jest.fn(),
}))

jest.mock("@/lib/wrapped/prompt-template", () => ({
  generateSystemPrompt: jest.fn(() => "System prompt"),
}))

// Mock all child components
jest.mock("@/components/admin/playground/template-selector", () => ({
  TemplateSelector: () => <div data-testid="template-selector">Template Selector</div>,
}))

jest.mock("@/components/admin/playground/test-configuration", () => ({
  TestConfiguration: () => <div data-testid="test-configuration">Test Configuration</div>,
}))

jest.mock("@/components/admin/playground/statistics-viewer", () => ({
  StatisticsViewer: () => <div data-testid="statistics-viewer">Statistics Viewer</div>,
}))

jest.mock("@/components/admin/playground/rendered-prompt", () => ({
  RenderedPrompt: () => <div data-testid="rendered-prompt">Rendered Prompt</div>,
}))

jest.mock("@/components/admin/playground/llm-response", () => ({
  LLMResponse: () => <div data-testid="llm-response">LLM Response</div>,
}))

jest.mock("@/components/admin/playground/preview-modal", () => ({
  PreviewModal: ({ show }: { show: boolean }) =>
    show ? <div data-testid="preview-modal">Preview Modal</div> : null,
}))

// Mock hooks
jest.mock("@/hooks/use-playground-state", () => ({
  usePlaygroundState: () => ({
    selectedTemplateId: "template-1",
    setSelectedTemplateId: jest.fn(),
    testConfig: {
      userName: "TestUser",
      year: 2024,
      model: "",
      temperature: undefined,
      maxTokens: undefined,
    },
    setTestConfig: jest.fn(),
    useCustomModel: false,
    setUseCustomModel: jest.fn(),
    result: null,
    setResult: jest.fn(),
    showStatistics: false,
    setShowStatistics: jest.fn(),
    statisticsViewMode: "formatted",
    setStatisticsViewMode: jest.fn(),
    showAIParameters: false,
    setShowAIParameters: jest.fn(),
    showRenderedPrompt: false,
    setShowRenderedPrompt: jest.fn(),
    clearSavedState: jest.fn(),
  }),
}))

jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
  }),
}))

// Mock actions
jest.mock("@/actions/prompt-test", () => ({
  testPromptTemplate: jest.fn(),
}))

jest.mock("@/actions/playground-wrapped", () => ({
  savePlaygroundWrapped: jest.fn(),
}))

// Mock fetch
global.fetch = jest.fn()

describe("WrappedPlayground", () => {
  const mockTemplates: PromptTemplate[] = [
    {
      id: "template-1",
      name: "Template 1",
      description: "Test template",
      template: "Test content",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const mockProps = {
    templates: mockTemplates,
    initialTemplateId: "template-1",
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ users: [], models: [], configuredModel: "gpt-4" }),
    })
  })

  describe("Basic Rendering", () => {
    it("should render the component", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      expect(screen.getByTestId("template-selector")).toBeInTheDocument()
      expect(screen.getByTestId("test-configuration")).toBeInTheDocument()
    })

    it("should render with templates", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      expect(screen.getByTestId("template-selector")).toBeInTheDocument()
    })

    it("should render without initial template id", async () => {
      await act(async () => {
        render(<WrappedPlayground templates={mockTemplates} />)
      })

      expect(screen.getByTestId("template-selector")).toBeInTheDocument()
    })
  })

  describe("Data Fetching", () => {
    it("should fetch plex users on mount", async () => {
      render(<WrappedPlayground {...mockProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/plex/users")
      }, { timeout: 3000 })
    })

    it("should fetch models on mount", async () => {
      render(<WrappedPlayground {...mockProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/models")
      }, { timeout: 3000 })
    })

    it("should handle fetch errors gracefully", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error("Fetch failed"))

      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      }, { timeout: 3000 })

      consoleError.mockRestore()
    })

    it("should handle failed fetch responses", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Failed" }),
      })

      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      }, { timeout: 3000 })

      consoleError.mockRestore()
    })
  })

  describe("Component Integration", () => {
    it("should render template selector", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      expect(screen.getByTestId("template-selector")).toBeInTheDocument()
    })

    it("should render test configuration", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      expect(screen.getByTestId("test-configuration")).toBeInTheDocument()
    })

    it("should not render statistics viewer initially", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      expect(screen.queryByTestId("statistics-viewer")).not.toBeInTheDocument()
    })

    it("should not render rendered prompt initially", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      expect(screen.queryByTestId("rendered-prompt")).not.toBeInTheDocument()
    })

    it("should not render llm response initially", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      expect(screen.queryByTestId("llm-response")).not.toBeInTheDocument()
    })

    it("should not render preview modal initially", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      // Preview modal should not be rendered initially
      expect(screen.queryByTestId("preview-modal")).not.toBeInTheDocument()
    })
  })

  describe("Empty Templates", () => {
    it("should render with empty templates array", async () => {
      await act(async () => {
        render(<WrappedPlayground templates={[]} />)
      })

      expect(screen.getByTestId("template-selector")).toBeInTheDocument()
    })
  })

  describe("Multiple Templates", () => {
    it("should render with multiple templates", async () => {
      const multipleTemplates: PromptTemplate[] = [
        {
          id: "template-1",
          name: "Template 1",
          description: "Test template 1",
          template: "Content 1",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "template-2",
          name: "Template 2",
          description: "Test template 2",
          template: "Content 2",
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await act(async () => {
        render(<WrappedPlayground templates={multipleTemplates} />)
      })

      expect(screen.getByTestId("template-selector")).toBeInTheDocument()
    })
  })

  describe("API Endpoints", () => {
    it("should call correct endpoint for users", async () => {
      render(<WrappedPlayground {...mockProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/plex/users")
      })
    })

    it("should call correct endpoint for models", async () => {
      render(<WrappedPlayground {...mockProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/models")
      })
    })
  })

  describe("Error Handling", () => {
    it("should not crash when fetch fails", async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"))

      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})

      await act(async () => {
        expect(() => {
          render(<WrappedPlayground {...mockProps} />)
        }).not.toThrow()
      })

      consoleError.mockRestore()
    })

    it("should handle malformed JSON responses", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON")
        },
      })

      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})

      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      }, { timeout: 3000 })

      consoleError.mockRestore()
    })
  })

  describe("Initial State", () => {
    it("should initialize with provided templates", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} />)
      })

      expect(screen.getByTestId("template-selector")).toBeInTheDocument()
    })

    it("should use initial template id when provided", async () => {
      await act(async () => {
        render(<WrappedPlayground {...mockProps} initialTemplateId="template-1" />)
      })

      expect(screen.getByTestId("template-selector")).toBeInTheDocument()
    })
  })

  describe("Layout", () => {
    it("should render components in correct order", async () => {
      let container: HTMLElement
      await act(async () => {
        const result = render(<WrappedPlayground {...mockProps} />)
        container = result.container
      })

      const components = container!.querySelectorAll("[data-testid]")
      expect(components[0]).toHaveAttribute("data-testid", "template-selector")
      expect(components[1]).toHaveAttribute("data-testid", "test-configuration")
    })

    it("should have proper spacing between components", async () => {
      let container: HTMLElement
      await act(async () => {
        const result = render(<WrappedPlayground {...mockProps} />)
        container = result.container
      })

      const mainDiv = container!.querySelector(".space-y-6")
      expect(mainDiv).toBeInTheDocument()
    })
  })

  describe("Fetch Response Handling", () => {
    it("should handle successful user fetch", async () => {
      const mockUsers = [
        { id: "1", name: "User1", email: "user1@test.com" },
        { id: "2", name: "User2", email: "user2@test.com" },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: mockUsers }),
      })

      render(<WrappedPlayground {...mockProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/plex/users")
      })
    })

    it("should handle successful models fetch", async () => {
      const mockModels = ["gpt-4", "gpt-3.5-turbo"]

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: mockModels, configuredModel: "gpt-4" }),
      })

      render(<WrappedPlayground {...mockProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/models")
      })
    })

    it("should handle empty users response", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: [] }),
      })

      render(<WrappedPlayground {...mockProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/plex/users")
      })
    })

    it("should handle empty models response", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [], configuredModel: "" }),
      })

      render(<WrappedPlayground {...mockProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/models")
      })
    })
  })
})

