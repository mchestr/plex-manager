/**
 * The admin assistant sheet (P6.1, UI-04): a dialog named "Assistant" that
 * closes by button and Escape back to its trigger, with log semantics and
 * labelled controls; answers render through MarkdownBody (P3.8, SEC-42).
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { chatWithAdminBot } from "@/actions/chatbot"
import { AssistantSheet, AssistantTrigger } from "@/components/admin/chatbot/assistant-sheet"
import { ChatProvider } from "@/components/admin/chatbot/chat-context"

expect.extend(toHaveNoViolations)

jest.mock("@/actions/chatbot", () => ({ chatWithAdminBot: jest.fn() }))
jest.mock("next/navigation", () => ({ usePathname: () => "/admin/users" }))

beforeAll(() => {
  // jsdom has no scrollIntoView; the transcript scrolls to each new message.
  Element.prototype.scrollIntoView = jest.fn()
})
beforeEach(() => jest.clearAllMocks())

function renderSheet() {
  return render(
    <ChatProvider>
      <AssistantTrigger data-testid="admin-chat-toggle">Assistant</AssistantTrigger>
      <AssistantSheet userName="Admin" />
    </ChatProvider>
  )
}

async function open() {
  const user = userEvent.setup()
  renderSheet()
  await user.click(screen.getByTestId("admin-chat-toggle"))
  const dialog = await screen.findByRole("dialog", { name: "Assistant" })
  return { user, dialog }
}

function replyWith(content: string) {
  jest.mocked(chatWithAdminBot).mockResolvedValue({
    success: true,
    data: { message: { role: "assistant", content, timestamp: Date.now() }, conversationId: "conv-1" },
  })
}

async function ask(text: string, user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Message the assistant"), text)
  await user.click(screen.getByRole("button", { name: "Send" }))
}

describe("AssistantSheet", () => {
  it("is a dialog named Assistant with a log, a labelled input and a named send", async () => {
    const { dialog } = await open()

    expect(screen.getByTestId("admin-chat-toggle")).toHaveAttribute("aria-expanded", "true")
    const log = within(dialog).getByRole("log")
    expect(log).toHaveAttribute("aria-live", "polite")
    expect(log).toHaveTextContent("I'm your admin assistant")
    expect(within(dialog).getByLabelText("Message the assistant")).toHaveAttribute("data-testid", "admin-chat-input")
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled()
    expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })

  it("closes with its close button and returns focus to the toggle", async () => {
    const { user } = await open()

    await user.click(screen.getByTestId("admin-chat-close"))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Assistant" })).not.toBeInTheDocument())
    expect(screen.getByTestId("admin-chat-toggle")).toHaveFocus()
    expect(screen.getByTestId("admin-chat-toggle")).toHaveAttribute("aria-expanded", "false")
  })

  it("closes on Escape and returns focus to the toggle", async () => {
    const { user } = await open()

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Assistant" })).not.toBeInTheDocument())
    expect(screen.getByTestId("admin-chat-toggle")).toHaveFocus()
  })

  it("keeps the conversation across a close", async () => {
    replyWith("All good")
    const { user } = await open()
    await ask("status?", user)
    await screen.findByText("All good")

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await user.click(screen.getByTestId("admin-chat-toggle"))

    expect(await screen.findByText("All good")).toBeInTheDocument()
  })

  it("keeps focus in the input during and after a reply, and sends nothing on Enter mid-reply", async () => {
    let resolveReply: (value: Awaited<ReturnType<typeof chatWithAdminBot>>) => void = () => {}
    jest.mocked(chatWithAdminBot).mockReturnValue(
      new Promise((resolve) => {
        resolveReply = resolve
      })
    )
    const { user } = await open()
    const input = screen.getByTestId("admin-chat-input")

    await user.click(input)
    await user.keyboard("status?{Enter}")
    expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "true")
    expect(input).toBeEnabled()
    expect(input).toHaveFocus()

    await user.keyboard("again{Enter}")
    expect(chatWithAdminBot).toHaveBeenCalledTimes(1)
    expect(input).toHaveValue("again")

    resolveReply({
      success: true,
      data: { message: { role: "assistant", content: "All good", timestamp: Date.now() }, conversationId: "conv-1" },
    })
    await screen.findByText("All good")
    expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "false")
    expect(input).toHaveFocus()
  })

  it("sends only roles and content, and the conversation id once it has one", async () => {
    replyWith("ok")
    const { user } = await open()
    await ask("status?", user)
    await screen.findByText("ok")
    await ask("again", user)
    await waitFor(() => expect(chatWithAdminBot).toHaveBeenCalledTimes(2))

    const calls = jest.mocked(chatWithAdminBot).mock.calls
    expect(calls[0][0]).toEqual({
      messages: [
        { role: "assistant", content: expect.stringContaining("admin assistant") },
        { role: "user", content: "status?" },
      ],
      conversationId: undefined,
    })
    expect(calls[1][0].conversationId).toBe("conv-1")
    expect(calls[1][0].messages.at(-1)).toEqual({ role: "user", content: "again" })
  })

  it("renders answers through MarkdownBody, with no image and no javascript: link", async () => {
    replyWith("Checks:\n\n- ok\n- fine\n\n![](https://example.com/?d=x) [run](javascript:alert(1))")
    const { user, dialog } = await open()
    await ask("status?", user)
    await screen.findByText("ok")

    expect(screen.getByText("ok").closest(".typeset")).not.toBeNull()
    expect(dialog.querySelectorAll(".typeset ul > li")).toHaveLength(2)
    expect(dialog.querySelector("img")).toBeNull()
    expect(dialog.innerHTML).not.toContain("example.com/?d=x")
    expect(screen.getByText("run").closest("a")).toBeNull()
  })

  it("shows the sources an answer used", async () => {
    jest.mocked(chatWithAdminBot).mockResolvedValue({
      success: true,
      data: {
        message: {
          role: "assistant",
          content: "Sonarr is fine",
          timestamp: Date.now(),
          sources: [{ tool: "get_sonarr_status", description: "Sonarr health" }],
        },
      },
    })
    const { user } = await open()
    await ask("sonarr?", user)

    expect(await screen.findByText("Get Sonarr Status")).toHaveAttribute("title", "Sonarr health")
  })

  it("shows the action's error copy on a refusal", async () => {
    jest.mocked(chatWithAdminBot).mockResolvedValue({
      success: false,
      code: "NOT_FOUND",
      error: "That conversation no longer exists. Start a new one.",
    })
    const { user } = await open()
    await ask("hi", user)

    expect(await screen.findByText(/That conversation no longer exists/)).toBeInTheDocument()
  })
})
