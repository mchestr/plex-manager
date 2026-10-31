/**
 * The Rewind writer and admin assistant steps (P10.25): the key is labelled
 * through the Field, a revisited step shows the saved key and sends a blank
 * one, a key error lands on the field and any other error inline, a save moves
 * to the next step, and Back and Skip for now are in the footer.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { saveChatLLMProvider, saveLLMProvider, skipSetupStep } from "@/actions/setup"
import { LLMStep } from "@/components/setup/setup-wizard/llm-step"
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/provider-presets"
import type { DevDefaults, SetupStoredLLM } from "@/types/setup"

jest.mock("@/actions/setup", () => ({
  saveLLMProvider: jest.fn(),
  saveChatLLMProvider: jest.fn(),
  skipSetupStep: jest.fn(),
}))

const mockPush = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }))

const DEV: DevDefaults = {
  plex: null,
  tautulli: null,
  overseerr: null,
  sonarr: null,
  radarr: null,
  discord: null,
  chatLlmProvider: null,
  wrappedLlmProvider: null,
  llmProvider: null,
  isDevMode: false,
  autoSubmit: false,
}

const STORED: SetupStoredLLM = { model: "gpt-4.1-mini", temperature: 0.4, maxTokens: 900, secret: { last4: "9f2c", origin: null } }

beforeEach(() => jest.clearAllMocks())

describe("LLMStep", () => {
  it("labels the key through the Field and saves the Rewind writer, then moves to the assistant", async () => {
    const user = userEvent.setup()
    jest.mocked(saveLLMProvider).mockResolvedValue({ success: true, data: null })
    render(<LLMStep purpose="wrapped" stored={null} devDefaults={DEV} />)

    expect(screen.getByRole("heading", { level: 1, name: "Choose the Rewind writer" })).toHaveFocus()
    expect(screen.getByText("For another provider, skip this step and set it up in Admin, Settings.")).toBeInTheDocument()
    await user.type(screen.getByLabelText("OpenAI API key"), "sk-test")
    await user.type(screen.getByTestId("setup-llm-rewind-temperature"), "0.7")
    await user.click(screen.getByTestId("setup-form-submit"))

    expect(saveLLMProvider).toHaveBeenCalledWith({
      provider: "openai",
      apiKey: "sk-test",
      model: DEFAULT_OPENAI_MODEL,
      temperature: 0.7,
      maxTokens: undefined,
    })
    expect(saveChatLLMProvider).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith("/setup?step=llm-chat")
  })

  it("keeps a revisited step's values and sends a blank key, so the stored one stays", async () => {
    const user = userEvent.setup()
    jest.mocked(saveChatLLMProvider).mockResolvedValue({ success: true, data: null })
    render(<LLMStep purpose="chat" stored={STORED} devDefaults={DEV} />)

    expect(screen.getByTestId("setup-llm-chat-api-key")).toHaveValue("")
    expect(screen.getByTestId("setup-llm-chat-temperature")).toHaveValue(0.4)
    expect(screen.getByTestId("setup-llm-chat-max-tokens")).toHaveValue(900)
    await user.click(screen.getByTestId("setup-form-submit"))

    expect(saveChatLLMProvider).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: undefined, model: "gpt-4.1-mini", temperature: 0.4, maxTokens: 900 })
    )
    expect(mockPush).toHaveBeenCalledWith("/setup?step=discord")
  })

  it("pre-fills the DEV_* key and model", () => {
    render(<LLMStep purpose="chat" stored={null} devDefaults={{ ...DEV, chatLlmProvider: { apiKey: "sk-dev", model: "gpt-dev-custom", maxTokens: 50 } }} />)

    expect(screen.getByTestId("setup-llm-chat-api-key")).toHaveValue("sk-dev")
    expect(screen.getByTestId("llm-model-custom-input")).toHaveValue("gpt-dev-custom")
    expect(screen.getByTestId("setup-llm-chat-max-tokens")).toHaveValue(50)
  })

  it("shows a key error on the field", async () => {
    const user = userEvent.setup()
    jest.mocked(saveLLMProvider).mockResolvedValue({
      success: false,
      code: "VALIDATION",
      error: "API key is required",
      fieldErrors: { apiKey: ["API key is required"] },
    })
    render(<LLMStep purpose="wrapped" stored={null} devDefaults={DEV} />)

    await user.click(screen.getByTestId("setup-form-submit"))

    const key = screen.getByLabelText("OpenAI API key")
    expect(key).toHaveAccessibleDescription(expect.stringContaining("API key is required"))
    expect(screen.queryByTestId("setup-llm-rewind-error")).not.toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("shows a failed key check inline", async () => {
    const user = userEvent.setup()
    jest.mocked(saveLLMProvider).mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: "Invalid API key" })
    render(<LLMStep purpose="wrapped" stored={null} devDefaults={DEV} />)

    await user.type(screen.getByLabelText("OpenAI API key"), "sk-wrong")
    await user.click(screen.getByTestId("setup-form-submit"))

    expect(screen.getByTestId("setup-llm-rewind-error")).toHaveTextContent("Invalid API key")
  })

  it("offers Back to the previous step and Skip for now", async () => {
    const user = userEvent.setup()
    jest.mocked(skipSetupStep).mockResolvedValue({ success: true, data: null })
    render(<LLMStep purpose="wrapped" stored={null} devDefaults={DEV} />)

    await user.click(screen.getByTestId("setup-back"))
    expect(mockPush).toHaveBeenLastCalledWith("/setup?step=radarr")

    await user.click(screen.getByTestId("setup-skip-step"))
    expect(skipSetupStep).toHaveBeenCalledWith({ stepId: "llm-rewind" })
    expect(mockPush).toHaveBeenLastCalledWith("/setup?step=llm-chat")
  })
})
