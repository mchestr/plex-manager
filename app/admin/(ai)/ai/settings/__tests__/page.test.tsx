/**
 * The AI settings page: its own admin check before any read, then the three
 * sections that used to sit in Settings' AI group, with the props they were
 * given there and "Last saved" only after a first save.
 */

import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

import { buildConfig } from "@/__tests__/helpers/factories"
import AiSettingsPage, { metadata } from "@/app/admin/(ai)/ai/settings/page"
import { AiSection } from "@/components/admin/settings/sections/ai-section"
import { AssistantSection } from "@/components/admin/settings/sections/assistant-section"
import { JudgeNightlySection } from "@/components/admin/settings/sections/judge-nightly-section"
import { assertAdmin } from "@/lib/admin"
import { getAdminSettings } from "@/lib/data/admin-settings"
import { getAssistantSources, type AssistantSources } from "@/lib/data/assistant-sources"
import { getSettingsAuditMeta } from "@/lib/settings/audit-meta"
import { getSettingsHealth } from "@/lib/settings/connection-health"

jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), connection: jest.fn().mockResolvedValue(undefined) }))
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/data/admin-settings", () => ({ getAdminSettings: jest.fn() }))
jest.mock("@/lib/data/assistant-sources", () => ({ getAssistantSources: jest.fn() }))
jest.mock("@/lib/settings/audit-meta", () => ({ getSettingsAuditMeta: jest.fn() }))
jest.mock("@/lib/settings/connection-health", () => ({ getSettingsHealth: jest.fn() }))
// The sections have their own tests; here only what the page hands them
jest.mock("@/components/admin/settings/sections/ai-section", () => ({
  AiSection: jest.fn(({ footerMeta }: { footerMeta?: ReactNode }) => <section data-testid="settings-ai-section">{footerMeta}</section>),
}))
jest.mock("@/components/admin/settings/sections/judge-nightly-section", () => ({
  JudgeNightlySection: jest.fn(({ footerMeta }: { footerMeta?: ReactNode }) => (
    <section data-testid="settings-conversation-review-section">{footerMeta}</section>
  )),
}))
jest.mock("@/components/admin/settings/sections/assistant-section", () => ({
  AssistantSection: jest.fn(() => <section data-testid="settings-assistant-section" />),
}))

const CHAT = { provider: "openai", model: "gpt-4o" }
const WRAPPED = { provider: "anthropic", model: "claude-sonnet" }
const JUDGE = { provider: "openai", model: "gpt-4o-mini" }
const AI_HEALTH = { status: "degraded", code: "LLM_DISABLED", checkedAt: "2026-11-02T12:00:00.000Z" }
const SOURCES: AssistantSources = { mcpServers: [], knowledgeSources: [], skillSources: [] }

const NEVER_SAVED = { ai: null, judge: null }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" } as never)
  jest.mocked(getAdminSettings).mockResolvedValue({
    config: buildConfig({
      llmDisabled: true,
      llmDailyCapPerUserUsd: 1,
      llmDailyCapAdminUsd: 5,
      llmDailyCapServerUsd: 20,
      judgeNightlyEnabled: true,
      judgeSampleRate: 40,
      judgeMinTurns: 3,
      llmDailyCapJudgeUsd: 2,
    }),
    chatLLMProvider: CHAT,
    wrappedLLMProvider: WRAPPED,
    judgeLLMProvider: JUDGE,
  } as never)
  jest.mocked(getSettingsHealth).mockResolvedValue({ ai: AI_HEALTH } as never)
  jest.mocked(getSettingsAuditMeta).mockResolvedValue(NEVER_SAVED as never)
  jest.mocked(getAssistantSources).mockResolvedValue(SOURCES)
})

async function renderPage() {
  render(await AiSettingsPage())
}

describe("AI settings page", () => {
  it("is titled AI settings", () => {
    expect(metadata.title).toBe("AI settings")
  })

  it("checks for an admin before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(AiSettingsPage()).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(getAdminSettings).not.toHaveBeenCalled()
    expect(getAssistantSources).not.toHaveBeenCalled()
  })

  it("shows the header, then the provider, conversation review and assistant sources sections", async () => {
    await renderPage()

    expect(screen.getByRole("heading", { level: 1, name: "AI settings" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-ai-settings-header")).toBeInTheDocument()
    expect(screen.getAllByTestId(/^settings-.+-section$/).map((section) => section.dataset.testid)).toEqual([
      "settings-ai-section",
      "settings-conversation-review-section",
      "settings-assistant-section",
    ])
  })

  it("gives the provider section the three providers, the caps and the AI health", async () => {
    await renderPage()

    expect(jest.mocked(AiSection).mock.calls[0][0]).toMatchObject({
      chat: CHAT,
      wrapped: WRAPPED,
      judge: JUDGE,
      llmDisabled: true,
      caps: { perUserUsd: 1, adminUsd: 5, serverUsd: 20 },
      health: AI_HEALTH,
    })
  })

  it("gives conversation review its saved settings, and the assistant section its sources", async () => {
    await renderPage()

    expect(jest.mocked(JudgeNightlySection).mock.calls[0][0].saved).toEqual({
      judgeNightlyEnabled: true,
      judgeSampleRate: 40,
      judgeMinTurns: 3,
      llmDailyCapJudgeUsd: 2,
    })
    expect(jest.mocked(AssistantSection).mock.calls[0][0]).toEqual({ sources: SOURCES })
  })

  it("leaves 'Last saved' out of both sections before a first save", async () => {
    await renderPage()

    expect(screen.queryByTestId("settings-ai-last-saved")).not.toBeInTheDocument()
    expect(screen.queryByTestId("settings-judge-last-saved")).not.toBeInTheDocument()
  })

  it("says who saved each section last, from the audit log", async () => {
    jest.mocked(getSettingsAuditMeta).mockResolvedValue({
      ai: { at: new Date("2026-11-01T12:00:00Z"), by: "Dana Whitfield", eventId: "audit-1" },
      judge: { at: new Date("2026-11-02T08:00:00Z"), by: "Sam Rivera", eventId: "audit-2" },
    } as never)
    await renderPage()

    expect(screen.getByTestId("settings-ai-section")).toContainElement(screen.getByTestId("settings-ai-last-saved"))
    expect(screen.getByTestId("settings-ai-last-saved")).toHaveTextContent("by Dana Whitfield")
    expect(screen.getByTestId("settings-conversation-review-section")).toContainElement(screen.getByTestId("settings-judge-last-saved"))
    expect(screen.getByTestId("settings-judge-last-saved")).toHaveTextContent("by Sam Rivera")
  })
})
