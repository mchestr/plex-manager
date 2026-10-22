/**
 * The assistant's daily spend caps on the settings page (P4.20). Since P10.20
 * they save through the AI section's footer, with errors on their fields.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { listLLMModels, updateLlmCaps } from "@/actions/admin"
import { AiSection } from "@/components/admin/settings/sections/ai-section"

jest.mock("@/actions/admin", () => ({
  listLLMModels: jest.fn(),
  setLLMDisabled: jest.fn(),
  updateLlmCaps: jest.fn(),
  updateChatLLMProvider: jest.fn(),
  updateWrappedLLMProvider: jest.fn(),
}))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const mockUpdate = jest.mocked(updateLlmCaps)

function renderSection() {
  return render(
    <AiSection
      chat={null}
      wrapped={null}
      llmDisabled={false}
      caps={{ perUserUsd: 0.5, adminUsd: 5, serverUsd: 5 }}
      health={{ status: "ok", code: null, checkedAt: null }}
    />
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listLLMModels).mockResolvedValue({ success: true, models: [], configuredProvider: null, configuredModel: null })
})

describe("Spend caps in the AI section", () => {
  it("shows the stored caps and saves the edited ones from the section footer", async () => {
    const user = userEvent.setup()
    mockUpdate.mockResolvedValue({ success: true, data: null })
    renderSection()

    expect(screen.getByTestId("llm-cap-user")).toHaveValue(0.5)
    expect(screen.getByLabelText("Whole server")).toHaveValue(5)
    expect(screen.getByTestId("settings-ai-save")).toBeDisabled()

    await user.clear(screen.getByTestId("llm-cap-user"))
    await user.type(screen.getByTestId("llm-cap-user"), "0.01")
    await user.clear(screen.getByTestId("llm-cap-server"))
    await user.type(screen.getByTestId("llm-cap-server"), "20")
    await user.click(screen.getByTestId("settings-ai-save"))

    expect(mockUpdate).toHaveBeenCalledWith({
      llmDailyCapPerUserUsd: 0.01,
      llmDailyCapAdminUsd: 5,
      llmDailyCapServerUsd: 20,
    })
    expect(mockShowSuccess).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("marks an empty or negative cap on its field and does not save it", async () => {
    const user = userEvent.setup()
    renderSection()

    await user.clear(screen.getByTestId("llm-cap-admin"))
    expect(screen.getByTestId("llm-cap-admin")).toHaveAttribute("aria-invalid", "true")
    await user.type(screen.getByTestId("llm-cap-admin"), "-1")
    expect(screen.getByTestId("llm-cap-admin")).toHaveAccessibleDescription(/Enter 0 or more/)

    await user.click(screen.getByTestId("settings-ai-save"))
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("shows the action's field error on its field", async () => {
    const user = userEvent.setup()
    mockUpdate.mockResolvedValue({
      success: false,
      code: "VALIDATION",
      error: "A cap can be at most 1000 USD a day",
      fieldErrors: { llmDailyCapServerUsd: ["A cap can be at most 1000 USD a day"] },
    })
    renderSection()

    await user.clear(screen.getByTestId("llm-cap-server"))
    await user.type(screen.getByTestId("llm-cap-server"), "5000")
    await user.click(screen.getByTestId("settings-ai-save"))

    expect(await screen.findByText("A cap can be at most 1000 USD a day")).toBeInTheDocument()
    expect(mockShowError).not.toHaveBeenCalled()
  })
})
