import { TemplateSelector } from "@/components/admin/playground/template-selector"
import { PromptTemplate } from "@/lib/generated/prisma/client"
import { fireEvent, render, screen } from "@testing-library/react"

// Mock the StyledDropdown component
jest.mock("@/components/ui/select", () => ({
  StyledDropdown: ({
    value,
    onChange,
    options,
  }: {
    value: string
    onChange: (value: string) => void
    options: Array<{ value: string; label: string }>
  }) => (
    <select
      data-testid="styled-dropdown"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}))

describe("TemplateSelector", () => {
  const mockTemplates: PromptTemplate[] = [
    {
      id: "template-1",
      name: "Template 1",
      description: "First template description",
      template: "Template content 1",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "template-2",
      name: "Template 2",
      description: "Second template description",
      template: "Template content 2",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "template-3",
      name: "Template 3",
      description: null,
      template: "Template content 3",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const mockProps = {
    templates: mockTemplates,
    selectedTemplateId: "template-1",
    onTemplateChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Basic Rendering", () => {
    it("should render the component", () => {
      render(<TemplateSelector {...mockProps} />)

      expect(screen.getByText("Template Selection")).toBeInTheDocument()
      expect(screen.getByText("Choose which prompt template to test")).toBeInTheDocument()
    })

    it("should render dropdown", () => {
      render(<TemplateSelector {...mockProps} />)

      expect(screen.getByTestId("styled-dropdown")).toBeInTheDocument()
    })

    it("should render label", () => {
      render(<TemplateSelector {...mockProps} />)

      expect(screen.getByText("Select Template")).toBeInTheDocument()
    })

    it("should render icon", () => {
      const { container } = render(<TemplateSelector {...mockProps} />)

      const svg = container.querySelector("svg")
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass("text-cyan-400")
    })
  })

  describe("Template Selection", () => {
    it("should display selected template", () => {
      render(<TemplateSelector {...mockProps} />)

      const dropdown = screen.getByTestId("styled-dropdown")
      expect(dropdown).toHaveValue("template-1")
    })

    it("should call onTemplateChange when selection changes", () => {
      render(<TemplateSelector {...mockProps} />)

      const dropdown = screen.getByTestId("styled-dropdown")
      fireEvent.change(dropdown, { target: { value: "template-2" } })

      expect(mockProps.onTemplateChange).toHaveBeenCalledWith("template-2")
    })

    it("should call onTemplateChange with correct value multiple times", () => {
      render(<TemplateSelector {...mockProps} />)

      const dropdown = screen.getByTestId("styled-dropdown")
      fireEvent.change(dropdown, { target: { value: "template-2" } })
      fireEvent.change(dropdown, { target: { value: "template-3" } })

      expect(mockProps.onTemplateChange).toHaveBeenCalledTimes(2)
      expect(mockProps.onTemplateChange).toHaveBeenNthCalledWith(1, "template-2")
      expect(mockProps.onTemplateChange).toHaveBeenNthCalledWith(2, "template-3")
    })
  })

  describe("Template Options", () => {
    it("should display all templates in dropdown", () => {
      render(<TemplateSelector {...mockProps} />)

      expect(screen.getByText("Template 1 (Active)")).toBeInTheDocument()
      expect(screen.getByText("Template 2")).toBeInTheDocument()
      expect(screen.getByText("Template 3")).toBeInTheDocument()
    })

    it("should mark active template with (Active) suffix", () => {
      render(<TemplateSelector {...mockProps} />)

      expect(screen.getByText("Template 1 (Active)")).toBeInTheDocument()
      expect(screen.queryByText("Template 2 (Active)")).not.toBeInTheDocument()
    })

    it("should not add suffix to inactive templates", () => {
      render(<TemplateSelector {...mockProps} />)

      const dropdown = screen.getByTestId("styled-dropdown")
      const option2 = Array.from(dropdown.querySelectorAll("option")).find(
        (opt) => opt.value === "template-2"
      )
      expect(option2?.textContent).toBe("Template 2")
    })
  })

  describe("Description Display", () => {
    it("should display description of selected template", () => {
      render(<TemplateSelector {...mockProps} selectedTemplateId="template-1" />)

      expect(screen.getByText("First template description")).toBeInTheDocument()
    })

    it("should update description when selection changes", () => {
      const { rerender } = render(
        <TemplateSelector {...mockProps} selectedTemplateId="template-1" />
      )

      expect(screen.getByText("First template description")).toBeInTheDocument()

      rerender(<TemplateSelector {...mockProps} selectedTemplateId="template-2" />)

      expect(screen.getByText("Second template description")).toBeInTheDocument()
    })

    it("should display 'No description' when template has no description", () => {
      render(<TemplateSelector {...mockProps} selectedTemplateId="template-3" />)

      expect(screen.getByText("No description")).toBeInTheDocument()
    })

    it("should not display description when no template is selected", () => {
      render(
        <TemplateSelector
          {...mockProps}
          templates={mockTemplates}
          selectedTemplateId="non-existent"
        />
      )

      expect(screen.queryByText("First template description")).not.toBeInTheDocument()
      expect(screen.queryByText("No description")).not.toBeInTheDocument()
    })
  })

  describe("Empty State", () => {
    it("should render with empty templates array", () => {
      render(<TemplateSelector {...mockProps} templates={[]} />)

      expect(screen.getByText("Template Selection")).toBeInTheDocument()
      expect(screen.getByTestId("styled-dropdown")).toBeInTheDocument()
    })

    it("should not display any options when templates array is empty", () => {
      render(<TemplateSelector {...mockProps} templates={[]} />)

      const dropdown = screen.getByTestId("styled-dropdown")
      expect(dropdown.querySelectorAll("option")).toHaveLength(0)
    })
  })

  describe("Single Template", () => {
    it("should render with single template", () => {
      render(<TemplateSelector {...mockProps} templates={[mockTemplates[0]]} />)

      expect(screen.getByText("Template 1 (Active)")).toBeInTheDocument()
    })

    it("should display description for single template", () => {
      render(
        <TemplateSelector
          {...mockProps}
          templates={[mockTemplates[0]]}
          selectedTemplateId="template-1"
        />
      )

      expect(screen.getByText("First template description")).toBeInTheDocument()
    })
  })

  describe("Styling", () => {
    it("should have proper container styling", () => {
      const { container } = render(<TemplateSelector {...mockProps} />)

      const mainDiv = container.querySelector(".bg-slate-800\\/50")
      expect(mainDiv).toBeInTheDocument()
      expect(mainDiv).toHaveClass("backdrop-blur-sm", "border", "border-slate-700/50")
    })

    it("should style description text", () => {
      const { container } = render(
        <TemplateSelector {...mockProps} selectedTemplateId="template-1" />
      )

      const descriptionElement = screen.getByText("First template description")
      expect(descriptionElement).toHaveClass("text-slate-400")
    })
  })

  describe("Template with Special Characters", () => {
    it("should handle template names with special characters", () => {
      const specialTemplates: PromptTemplate[] = [
        {
          id: "special-1",
          name: "Template with <html> & special chars",
          description: "Description",
          template: "Content",
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      render(
        <TemplateSelector
          {...mockProps}
          templates={specialTemplates}
          selectedTemplateId="special-1"
        />
      )

      expect(screen.getByText("Template with <html> & special chars")).toBeInTheDocument()
    })

    it("should handle descriptions with special characters", () => {
      const specialTemplates: PromptTemplate[] = [
        {
          id: "special-1",
          name: "Template",
          description: "Description with <tags> & symbols",
          template: "Content",
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      render(
        <TemplateSelector
          {...mockProps}
          templates={specialTemplates}
          selectedTemplateId="special-1"
        />
      )

      expect(screen.getByText("Description with <tags> & symbols")).toBeInTheDocument()
    })
  })

  describe("Multiple Active Templates", () => {
    it("should mark all active templates with (Active) suffix", () => {
      const multipleActiveTemplates: PromptTemplate[] = [
        { ...mockTemplates[0], isActive: true },
        { ...mockTemplates[1], isActive: true },
        { ...mockTemplates[2], isActive: false },
      ]

      render(
        <TemplateSelector {...mockProps} templates={multipleActiveTemplates} />
      )

      expect(screen.getByText("Template 1 (Active)")).toBeInTheDocument()
      expect(screen.getByText("Template 2 (Active)")).toBeInTheDocument()
      expect(screen.getByText("Template 3")).toBeInTheDocument()
    })
  })

  describe("Long Template Names", () => {
    it("should handle very long template names", () => {
      const longNameTemplate: PromptTemplate[] = [
        {
          id: "long-1",
          name: "A".repeat(100),
          description: "Description",
          template: "Content",
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      render(
        <TemplateSelector
          {...mockProps}
          templates={longNameTemplate}
          selectedTemplateId="long-1"
        />
      )

      expect(screen.getByText("A".repeat(100))).toBeInTheDocument()
    })

    it("should handle very long descriptions", () => {
      const longDescTemplate: PromptTemplate[] = [
        {
          id: "long-1",
          name: "Template",
          description: "B".repeat(500),
          template: "Content",
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      render(
        <TemplateSelector
          {...mockProps}
          templates={longDescTemplate}
          selectedTemplateId="long-1"
        />
      )

      expect(screen.getByText("B".repeat(500))).toBeInTheDocument()
    })
  })
})

