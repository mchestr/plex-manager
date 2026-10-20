/**
 * The assistant's daily spend caps on the settings page (P4.20).
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { updateLlmCaps } from "@/actions/admin"
import { LlmSpendCapsForm } from "@/components/admin/settings/llm-spend-caps-form"

jest.mock("@/actions/admin", () => ({ updateLlmCaps: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const mockUpdate = jest.mocked(updateLlmCaps)

beforeEach(() => jest.clearAllMocks())

describe("LlmSpendCapsForm", () => {
  it("shows the stored caps and saves the edited ones", async () => {
    const user = userEvent.setup()
    mockUpdate.mockResolvedValue({ success: true, data: null })
    render(<LlmSpendCapsForm perUserUsd={0.5} adminUsd={5} serverUsd={5} />)

    expect(screen.getByTestId("llm-cap-user")).toHaveValue(0.5)
    expect(screen.getByLabelText("Whole server")).toHaveValue(5)

    await user.clear(screen.getByTestId("llm-cap-user"))
    await user.type(screen.getByTestId("llm-cap-user"), "0.01")
    await user.clear(screen.getByTestId("llm-cap-server"))
    await user.type(screen.getByTestId("llm-cap-server"), "20")
    await user.click(screen.getByTestId("llm-caps-save"))

    expect(mockUpdate).toHaveBeenCalledWith({
      llmDailyCapPerUserUsd: 0.01,
      llmDailyCapAdminUsd: 5,
      llmDailyCapServerUsd: 20,
    })
    expect(mockShowSuccess).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("will not save an empty or negative cap", async () => {
    const user = userEvent.setup()
    render(<LlmSpendCapsForm perUserUsd={0.5} adminUsd={5} serverUsd={5} />)

    await user.clear(screen.getByTestId("llm-cap-admin"))
    expect(screen.getByTestId("llm-caps-save")).toBeDisabled()
    expect(screen.getByTestId("llm-cap-admin")).toHaveAttribute("aria-invalid", "true")

    await user.type(screen.getByTestId("llm-cap-admin"), "-1")
    expect(screen.getByTestId("llm-caps-save")).toBeDisabled()
  })

  it("shows the action's error", async () => {
    const user = userEvent.setup()
    mockUpdate.mockResolvedValue({ success: false, code: "VALIDATION", error: "A cap can be at most 1000 USD a day" })
    render(<LlmSpendCapsForm perUserUsd={0.5} adminUsd={5} serverUsd={5} />)

    await user.click(screen.getByTestId("llm-caps-save"))

    expect(mockShowError).toHaveBeenCalledWith("A cap can be at most 1000 USD a day")
  })
})
