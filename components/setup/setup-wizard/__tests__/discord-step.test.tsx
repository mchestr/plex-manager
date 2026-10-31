/**
 * The Discord step (P10.25): the two switches and the settings' fields,
 * labelled through the Field; a save sends blank secrets as undefined (so the
 * stored ones stay) and moves on; field errors land on their fields and other
 * errors inline; a failed Skip for now says why.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { saveDiscordIntegration, skipSetupStep } from "@/actions/setup"
import type { StoredDiscordIntegration } from "@/components/admin/settings/discord-integration-form"
import { DiscordStep } from "@/components/setup/setup-wizard/discord-step"
import type { DevDefaults } from "@/types/setup"

jest.mock("@/actions/setup", () => ({ saveDiscordIntegration: jest.fn(), skipSetupStep: jest.fn() }))
jest.mock("@/actions/discord", () => ({ updateDiscordIntegrationSettings: jest.fn() }))

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

const STORED: StoredDiscordIntegration = {
  isEnabled: true,
  botEnabled: false,
  clientId: "1234",
  secrets: { clientSecret: { last4: "c0de", origin: null }, botToken: null },
  guildId: "guild-1",
  platformName: "Northfield",
}

beforeEach(() => jest.clearAllMocks())

describe("DiscordStep", () => {
  it("saves the switches and fields, sends blank secrets as undefined and moves on", async () => {
    const user = userEvent.setup()
    jest.mocked(saveDiscordIntegration).mockResolvedValue({ success: true, data: null })
    render(<DiscordStep stored={STORED} devDefaults={DEV} />)

    expect(screen.getByRole("heading", { level: 1, name: "Connect Discord" })).toHaveFocus()
    expect(screen.getByText("Answers slash commands and direct messages.")).toBeInTheDocument()
    expect(screen.getByLabelText("Client ID")).toHaveValue("1234")
    await user.click(screen.getByTestId("setup-discord-bot-toggle"))
    await user.click(screen.getByTestId("setup-form-submit"))

    expect(saveDiscordIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: true, botEnabled: true, clientId: "1234", clientSecret: undefined, botToken: undefined, guildId: "guild-1" })
    )
    expect(mockPush).toHaveBeenCalledWith("/setup?step=summary")
  })

  it("pre-fills the DEV_* values on a first visit only", () => {
    const dev = { ...DEV, discord: { isEnabled: true, clientId: "dev-client", platformName: "Dev Plex" } }

    const { unmount } = render(<DiscordStep stored={null} devDefaults={dev} />)
    expect(screen.getByLabelText("Client ID")).toHaveValue("dev-client")
    expect(screen.getByLabelText("Platform name")).toHaveValue("Dev Plex")
    expect(screen.getByTestId("setup-discord-toggle")).toBeChecked()
    unmount()

    render(<DiscordStep stored={STORED} devDefaults={dev} />)
    expect(screen.getByLabelText("Client ID")).toHaveValue("1234")
  })

  it("puts field errors on their fields", async () => {
    const user = userEvent.setup()
    const message = "Client ID and client secret are required to turn on linked roles"
    jest.mocked(saveDiscordIntegration).mockResolvedValue({
      success: false,
      code: "VALIDATION",
      error: message,
      fieldErrors: { clientId: [message], clientSecret: [message], unknownField: ["ignored"] },
    })
    render(<DiscordStep stored={null} devDefaults={DEV} />)

    await user.click(screen.getByTestId("setup-discord-toggle"))
    await user.click(screen.getByTestId("setup-form-submit"))

    const clientId = screen.getByLabelText("Client ID")
    expect(clientId).toHaveAccessibleDescription(expect.stringContaining(message))
    expect(screen.queryByTestId("setup-discord-error")).not.toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("shows an error without fields inline", async () => {
    const user = userEvent.setup()
    jest.mocked(saveDiscordIntegration).mockResolvedValue({ success: false, code: "INTERNAL", error: "Failed to save Discord integration" })
    render(<DiscordStep stored={null} devDefaults={DEV} />)

    await user.click(screen.getByTestId("setup-form-submit"))

    expect(screen.getByTestId("setup-discord-error")).toHaveTextContent("Failed to save Discord integration")
  })

  it("says why Skip for now failed and stays on the step", async () => {
    const user = userEvent.setup()
    jest.mocked(skipSetupStep).mockResolvedValue({ success: false, code: "CONFLICT", error: "Finish the earlier steps first" })
    render(<DiscordStep stored={null} devDefaults={DEV} />)

    await user.click(screen.getByTestId("setup-skip-step"))

    expect(skipSetupStep).toHaveBeenCalledWith({ stepId: "discord" })
    expect(screen.getByRole("alert")).toHaveTextContent("Finish the earlier steps first")
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("goes Back to the assistant step", async () => {
    const user = userEvent.setup()
    render(<DiscordStep stored={null} devDefaults={DEV} />)

    await user.click(screen.getByTestId("setup-back"))

    expect(mockPush).toHaveBeenCalledWith("/setup?step=llm-chat")
  })
})
