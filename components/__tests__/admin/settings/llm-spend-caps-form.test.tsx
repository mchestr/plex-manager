/**
 * The assistant's daily spend caps on the settings page (P4.20). They read
 * as money on the AI section's Admin assistant tab until Edit, then save
 * through the section's footer, with errors on their fields.
 */

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { listLLMModels, updateChatLLMProvider } from "@/actions/admin/admin-llm-providers"
import { updateLlmCaps } from "@/actions/admin/admin-config"
import { AiSection } from "@/components/admin/settings/sections/ai-section"
import type { SpendCaps } from "@/components/admin/settings/llm-spend-caps-form"
import type { StoredLLMProvider } from "@/hooks/use-llm-provider-form"

jest.mock("@/actions/admin/admin-llm-providers", () => ({ listLLMModels: jest.fn(), updateChatLLMProvider: jest.fn(), updateWrappedLLMProvider: jest.fn() }))
jest.mock("@/actions/admin/admin-config", () => ({ setLLMDisabled: jest.fn(), updateLlmCaps: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const mockUpdate = jest.mocked(updateLlmCaps)
const CAPS: SpendCaps = { perUserUsd: 0.5, adminUsd: 5, serverUsd: 5 }

function renderSection(caps: SpendCaps = CAPS, chat: StoredLLMProvider | null = null) {
  return render(<AiSection chat={chat} wrapped={null} llmDisabled={false} caps={caps} health={{ status: "ok", code: null, checkedAt: null }} />)
}

/** Lets a save, and the section's answer to it, finish. */
const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
})

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId("settings-ai-edit"))
  return screen.getByTestId("llm-spend-caps-form")
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listLLMModels).mockResolvedValue({ success: true, data: { models: [], configuredProvider: null, configuredModel: null } })
})

describe("Spend caps in the AI section", () => {
  it("reads the saved caps as money a day, and a cap of 0 as the assistant off", () => {
    renderSection({ perUserUsd: 0.5, adminUsd: 5, serverUsd: 0 })

    expect(screen.getByTestId("settings-ai-summary-caps-user")).toHaveTextContent("Per member$0.50 a day")
    expect(screen.getByTestId("settings-ai-summary-caps-admin")).toHaveTextContent("$5.00 a day")
    expect(screen.getByTestId("settings-ai-summary-caps-server")).toHaveTextContent("$0.00 a day, assistant off for everyone")
    expect(screen.queryByTestId("llm-cap-user")).not.toBeInTheDocument()
  })

  it("saves the edited caps from the section footer and returns to the summary", async () => {
    const user = userEvent.setup()
    mockUpdate.mockResolvedValue({ success: true, data: null })
    renderSection()

    await edit(user)
    expect(screen.getByTestId("llm-cap-user")).toHaveValue(0.5)
    expect(screen.getByLabelText("Whole server")).toHaveValue(5)
    expect(screen.getByTestId("settings-ai-save")).toBeEnabled()

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
    expect(mockShowSuccess).toHaveBeenCalledWith("Assistant spend caps saved")
    await waitFor(() => expect(screen.getByTestId("settings-ai-edit")).toHaveFocus())
    expect(screen.queryByTestId("llm-spend-caps-form")).not.toBeInTheDocument()
    // The action revalidates /admin/settings, so no client refresh follows (P10.7)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("marks an empty or negative cap on its field, and a save stops there and stays open", async () => {
    const user = userEvent.setup()
    renderSection()
    await edit(user)

    await user.clear(screen.getByTestId("llm-cap-admin"))
    expect(screen.getByTestId("llm-cap-admin")).toHaveAttribute("aria-invalid", "true")
    await user.type(screen.getByTestId("llm-cap-admin"), "-1")
    expect(screen.getByTestId("llm-cap-admin")).toHaveAccessibleDescription(/Enter 0 or more/)

    await user.click(screen.getByTestId("settings-ai-save"))
    await settle()

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(screen.getByTestId("settings-ai-editing")).toBeInTheDocument()
    expect(screen.getByTestId("llm-cap-admin")).toHaveValue(-1)
  })

  it("shows the action's field error on its field, stays open, and Cancel clears it", async () => {
    const user = userEvent.setup()
    mockUpdate.mockResolvedValue({
      success: false,
      code: "VALIDATION",
      error: "A cap can be at most 1000 USD a day",
      fieldErrors: { llmDailyCapServerUsd: ["A cap can be at most 1000 USD a day"] },
    })
    renderSection()
    await edit(user)

    await user.clear(screen.getByTestId("llm-cap-server"))
    await user.type(screen.getByTestId("llm-cap-server"), "5000")
    await user.click(screen.getByTestId("settings-ai-save"))

    expect(await screen.findByText("A cap can be at most 1000 USD a day")).toBeInTheDocument()
    expect(screen.getByTestId("settings-ai-editing")).toBeInTheDocument()
    expect(mockShowError).not.toHaveBeenCalled()

    // Cancel waits for the save to settle
    await waitFor(() => expect(screen.getByTestId("settings-ai-cancel")).toBeEnabled())
    await user.click(screen.getByTestId("settings-ai-cancel"))
    await user.click(await screen.findByTestId("settings-ai-discard-dialog-confirm"))
    await edit(user)
    expect(screen.queryByText("A cap can be at most 1000 USD a day")).not.toBeInTheDocument()
    expect(screen.getByTestId("llm-cap-server")).toHaveValue(5)
  })

  it("saves a changed provider and changed caps together, and stays open when either fails", async () => {
    const user = userEvent.setup()
    jest.mocked(updateChatLLMProvider).mockResolvedValue({ success: true, data: null })
    mockUpdate.mockResolvedValue({ success: false, code: "INTERNAL", error: "Could not save the caps" })
    renderSection(CAPS, {
      provider: "openai",
      model: "gpt-4o",
      secret: { last4: "9876", origin: "https://api.openai.com" },
      baseUrl: null,
      effort: null,
      temperature: null,
      maxTokens: null,
    })
    await edit(user)

    await user.type(screen.getByTestId("llm-max-tokens-input"), "4000")
    await user.clear(screen.getByTestId("llm-cap-user"))
    await user.type(screen.getByTestId("llm-cap-user"), "2")
    await user.click(screen.getByTestId("settings-ai-save"))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Could not save the caps"))
    await settle()
    expect(updateChatLLMProvider).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai", model: "gpt-4o", apiKey: undefined, maxTokens: 4000 }))
    expect(mockUpdate).toHaveBeenCalledWith({ llmDailyCapPerUserUsd: 2, llmDailyCapAdminUsd: 5, llmDailyCapServerUsd: 5 })
    // The provider saved, but the caps did not: the section stays open on them
    expect(screen.getByTestId("settings-ai-editing")).toBeInTheDocument()
    expect(screen.getByTestId("llm-cap-user")).toHaveValue(2)
  })
})
