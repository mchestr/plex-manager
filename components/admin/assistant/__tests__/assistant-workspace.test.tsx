/**
 * The assistant page (UI-04): log semantics and labelled controls, answers
 * through MarkdownBody (SEC-42) in the viewer's zone (P11.17), a composer that
 * keeps focus and gives a refused message back, the URL following a new
 * conversation's id, a transcript that follows the conversation the server
 * sends, the history by day with its deletes, and the off state.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import type { ComponentProps } from "react"

import { chatWithAdminBot, deleteAssistantConversation } from "@/actions/chatbot"
import { AssistantWorkspace } from "@/components/admin/assistant/assistant-workspace"
import { SUGGESTIONS } from "@/components/admin/assistant/assistant-welcome"
import { ToastProvider } from "@/components/ui/toast"
import type { AssistantConversation, ChatMessage } from "@/lib/chatbot/types"
import { FormatProvider } from "@/lib/format-context"
import { browserTimeZone } from "@/lib/utils/browser-zone"

expect.extend(toHaveNoViolations)

jest.mock("@/actions/chatbot", () => ({ chatWithAdminBot: jest.fn(), deleteAssistantConversation: jest.fn() }))
jest.mock("@/lib/utils/browser-zone", () => ({ browserTimeZone: jest.fn() }))
// One router for the whole test, as Next gives the page
const router = { replace: jest.fn(), refresh: jest.fn(), push: jest.fn(), prefetch: jest.fn() }
jest.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/admin/assistant" }))

const NOW = Date.parse("2026-12-01T12:00:00Z")
const noRegion = { rules: { region: { enabled: false } } }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(browserTimeZone).mockReturnValue("Europe/Berlin")
})
afterEach(() => jest.restoreAllMocks())

type Props = ComponentProps<typeof AssistantWorkspace>

function ui(overrides: Partial<Props>) {
  return (
    // The app zone; the browser's is Europe/Berlin
    <FormatProvider value={{ timeZone: "America/Los_Angeles", locale: "en-US" }}>
      <ToastProvider>
        <AssistantWorkspace
          available
          disclosure="Server admins can review assistant conversations, and messages are processed by Anthropic."
          usageTextDays={90}
          historyDays={90}
          history={[]}
          conversation={null}
          now={NOW}
          canConfigure
          {...overrides}
        />
      </ToastProvider>
    </FormatProvider>
  )
}

function view(overrides: Partial<Props> = {}) {
  const result = render(ui(overrides))
  return { ...result, rerenderWith: (next: Partial<Props>) => result.rerender(ui(next)) }
}

const answer = (content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ role: "assistant", content, timestamp: NOW, ...extra })

function replyWith(content: string, conversationId = "conv-1", extra: Partial<ChatMessage> = {}) {
  jest.mocked(chatWithAdminBot).mockResolvedValue({ success: true, data: { message: answer(content, extra), conversationId } })
}

/** A reply the test finishes itself. */
function holdReply() {
  let finish: (value: Awaited<ReturnType<typeof chatWithAdminBot>>) => void = () => {}
  jest.mocked(chatWithAdminBot).mockReturnValue(new Promise((resolve) => (finish = resolve)))
  return (content: string, conversationId = "conv-1") =>
    act(async () => finish({ success: true, data: { message: answer(content), conversationId } }))
}

const input = () => screen.getByLabelText("Message the assistant")

async function ask(text: string, user = userEvent.setup()) {
  await user.type(input(), text)
  await user.click(screen.getByRole("button", { name: "Send" }))
  return user
}

const conversation = (id: string, question: string, reply: string): AssistantConversation => ({
  id,
  title: question,
  messages: [
    { role: "user", content: question, timestamp: NOW - 60_000 },
    { role: "assistant", content: reply, timestamp: NOW - 30_000 },
  ],
})

describe("AssistantWorkspace", () => {
  it("has a log, a labelled message box and a named send, with no axe violations", async () => {
    const { container } = view()

    expect(screen.getByRole("heading", { level: 1, name: "Assistant" })).toBeInTheDocument()
    const log = screen.getByRole("log", { name: "Conversation" })
    expect(log).toHaveAttribute("aria-live", "polite")
    expect(within(log).getByRole("heading", { name: "Ask about your server" })).toBeInTheDocument()
    expect(input()).toHaveAttribute("data-testid", "admin-chat-input")
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
    expect(screen.getByTestId("admin-chat-disclosure")).toHaveTextContent("processed by Anthropic")
    expect(await axe(container, noRegion)).toHaveNoViolations()
  })

  it("sends with Enter, adds a line with Shift+Enter, and sends the browser's zone", async () => {
    replyWith("ok")
    const user = userEvent.setup()
    view()

    await user.type(input(), "status?{Shift>}{Enter}{/Shift}and queues")
    expect(input()).toHaveValue("status?\nand queues")
    await user.keyboard("{Enter}")

    await screen.findByText("ok")
    expect(chatWithAdminBot).toHaveBeenCalledWith({ message: "status?\nand queues", conversationId: undefined, timeZone: "Europe/Berlin" })
    expect(input()).toHaveValue("")
  })

  it("moves the URL to a new conversation's id with its first reply, keeping the transcript when the server catches up", async () => {
    replyWith("Two streams.")
    const { rerenderWith } = view()
    const user = await ask("Who is streaming?")
    await screen.findByText("Two streams.")

    expect(router.replace).toHaveBeenCalledWith("/admin/assistant?conversation=conv-1", { scroll: false })
    rerenderWith({ conversation: conversation("conv-1", "Who is streaming?", "Two streams."), history: [{ id: "conv-1", title: "Who is streaming?", lastMessageAt: NOW }] })

    expect(screen.getByRole("heading", { level: 1, name: "Who is streaming?" })).toBeInTheDocument()
    expect(screen.getAllByTestId("admin-chat-answer")).toHaveLength(1)
    expect(router.replace).toHaveBeenCalledTimes(1)

    replyWith("None are transcoding.")
    await ask("Any transcodes?", user)
    await screen.findByText("None are transcoding.")
    expect(jest.mocked(chatWithAdminBot).mock.calls[1][0]).toMatchObject({ message: "Any transcodes?", conversationId: "conv-1" })
  })

  it("keeps focus in the box while a reply loads, and sends nothing on Enter meanwhile", async () => {
    const finish = holdReply()
    const user = userEvent.setup()
    view()

    await user.type(input(), "status?{Enter}")
    expect(chatWithAdminBot).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("admin-chat-thinking")).toHaveTextContent("Thinking…")
    expect(input()).toHaveFocus()
    expect(input()).toBeEnabled()

    await user.type(input(), "again{Enter}")
    expect(chatWithAdminBot).toHaveBeenCalledTimes(1)

    await finish("done")
    expect(await screen.findByText("done")).toBeInTheDocument()
    expect(input()).toHaveFocus()
    expect(input()).toHaveValue("again")
  })

  it("takes a refused message out of the transcript and gives it back to the box, with the error", async () => {
    jest.mocked(chatWithAdminBot).mockResolvedValue({
      success: false,
      code: "NOT_FOUND",
      error: "That conversation no longer exists. Start a new one.",
    })
    view()
    await ask("hi")

    expect(await screen.findByTestId("admin-chat-error")).toHaveTextContent("That conversation no longer exists")
    expect(screen.queryByTestId("admin-chat-question")).not.toBeInTheDocument()
    expect(input()).toHaveValue("hi")
  })

  it("keeps what was typed meanwhile when a message is refused, and says when the server cannot be reached", async () => {
    let fail: (error: Error) => void = () => {}
    jest.mocked(chatWithAdminBot).mockReturnValue(new Promise((_, reject) => (fail = reject)))
    const user = userEvent.setup()
    view()

    await user.type(input(), "first{Enter}")
    await user.type(input(), "second")
    await act(async () => fail(new Error("offline")))

    expect(await screen.findByTestId("admin-chat-error")).toHaveTextContent("The assistant could not be reached. Try again.")
    expect(input()).toHaveValue("second")
  })

  it("shows each message's time in the browser's zone, not the app zone", async () => {
    // 17:05 in Berlin, 08:05 in Los Angeles
    jest.spyOn(Date, "now").mockReturnValue(NOW)
    replyWith("ok", "conv-1", { timestamp: Date.parse("2026-12-01T16:05:00Z") })
    view()
    await ask("status?")
    await screen.findByText("ok")

    expect(within(screen.getByTestId("admin-chat-answer")).getByText("5:05 PM")).toBeInTheDocument()
    expect(screen.queryByText("8:05 AM")).not.toBeInTheDocument()
  })

  it("renders answers through MarkdownBody, with no image and no javascript: link", async () => {
    replyWith("Checks:\n\n- ok\n- fine\n\n![](https://example.com/?d=x) [run](javascript:alert(1))")
    view()
    await ask("status?")
    await screen.findByText("ok")

    const log = screen.getByRole("log")
    expect(screen.getByText("ok").closest(".typeset")).not.toBeNull()
    expect(log.querySelectorAll(".typeset ul > li")).toHaveLength(2)
    expect(log.querySelector("img")).toBeNull()
    expect(log.innerHTML).not.toContain("example.com/?d=x")
    expect(screen.getByText("run").closest("a")).toBeNull()
  })

  it("shows the sources an answer used", async () => {
    replyWith("Sonarr is fine", "conv-1", { sources: [{ tool: "get_sonarr_status", description: "Sonarr health" }] })
    view()
    await ask("sonarr?")

    expect(await screen.findByText("Get Sonarr Status")).toHaveAttribute("title", "Sonarr health")
  })

  it("opens a stored conversation and replaces the transcript when another opens", () => {
    const { rerenderWith } = view({ conversation: conversation("a", "Is Plex up?", "Plex is up.") })
    expect(screen.getByText("Plex is up.")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-chat-welcome")).not.toBeInTheDocument()

    rerenderWith({ conversation: conversation("b", "Is Sonarr up?", "Sonarr is up.") })

    expect(screen.getByText("Sonarr is up.")).toBeInTheDocument()
    expect(screen.queryByText("Plex is up.")).not.toBeInTheDocument()

    rerenderWith({ conversation: null })
    expect(screen.getByTestId("admin-chat-welcome")).toBeInTheDocument()
  })

  it("drops a late reply for a conversation that was left", async () => {
    const finish = holdReply()
    const { rerenderWith } = view()
    await ask("first question")

    rerenderWith({ conversation: conversation("b", "Is Sonarr up?", "Sonarr is up.") })
    await finish("the late answer")

    expect(screen.queryByText("the late answer")).not.toBeInTheDocument()
    expect(screen.queryByText("first question")).not.toBeInTheDocument()
    expect(screen.getByText("Sonarr is up.")).toBeInTheDocument()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it("sends a suggested question at once and moves focus to the box", async () => {
    replyWith("Two streams.")
    const user = userEvent.setup()
    view()

    expect(screen.getAllByRole("button", { name: /\?$/ }).map((button) => button.textContent)).toEqual(SUGGESTIONS)
    await user.click(screen.getByTestId("admin-chat-suggestion-0"))

    expect(chatWithAdminBot).toHaveBeenCalledWith(expect.objectContaining({ message: SUGGESTIONS[0] }))
    expect(await screen.findByText("Two streams.")).toBeInTheDocument()
    expect(input()).toHaveFocus()
  })

  it("says the assistant is off, keeps the history readable and sends nothing", () => {
    view({ available: false, conversation: conversation("a", "Is Plex up?", "Plex is up.") })

    expect(screen.getByTestId("admin-chat-unavailable")).toHaveTextContent("The assistant is off")
    expect(screen.getByTestId("admin-chat-open-settings")).toHaveAttribute("href", "/admin/settings#ai")
    expect(screen.getByText("Plex is up.")).toBeInTheDocument()
    expect(input()).toBeDisabled()
  })

  it("tells a Support user to ask an admin, without the settings link, and offers no suggestions", () => {
    view({ available: false, canConfigure: false })

    expect(screen.getByTestId("admin-chat-unavailable")).toHaveTextContent("An admin needs to turn on AI features")
    expect(screen.queryByTestId("admin-chat-open-settings")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-chat-suggestion-0")).not.toBeInTheDocument()
  })
})

describe("the history", () => {
  const history = [
    { id: "today", title: "Is Plex up?", lastMessageAt: NOW - 60 * 60 * 1000 },
    { id: "older", title: "What did members request?", lastMessageAt: NOW - 3 * 24 * 60 * 60 * 1000 },
  ]

  it("lists the conversations by day, marks the open one and links each", () => {
    view({ history, conversation: conversation("today", "Is Plex up?", "Plex is up.") })

    const list = screen.getByTestId("admin-assistant-history")
    expect(within(list).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Today", "Previous 7 days"])
    expect(screen.getByTestId("admin-assistant-history-item-today")).toHaveAttribute("aria-current", "page")
    expect(screen.getByTestId("admin-assistant-history-item-older")).toHaveAttribute("href", "/admin/assistant?conversation=older")
    expect(screen.getByTestId("admin-assistant-history-new")).toHaveAttribute("href", "/admin/assistant")
    expect(screen.getByTestId("admin-assistant-history-window")).toHaveTextContent("90 days after their last message")
  })

  it("says when there is nothing yet", () => {
    view()

    expect(screen.getByTestId("admin-assistant-history-empty")).toHaveTextContent("No conversations yet.")
  })

  it("deletes the open conversation after a confirm and leaves its URL", async () => {
    jest.mocked(deleteAssistantConversation).mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    view({ history, conversation: conversation("today", "Is Plex up?", "Plex is up.") })

    await user.click(screen.getByTestId("admin-assistant-history-delete-today"))
    const dialog = await screen.findByTestId("admin-assistant-delete-dialog")
    expect(dialog).toHaveTextContent("“Is Plex up?” leaves your history")
    expect(dialog).toHaveTextContent("for up to 90 days")
    await user.click(within(dialog).getByTestId("admin-assistant-delete-confirm"))

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/assistant"))
    expect(deleteAssistantConversation).toHaveBeenCalledWith({ conversationId: "today" })
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it("refreshes the list after deleting another conversation, and shows a refusal in the dialog", async () => {
    jest.mocked(deleteAssistantConversation).mockResolvedValueOnce({ success: false, code: "NOT_FOUND", error: "That conversation is already gone" })
    const user = userEvent.setup()
    view({ history, conversation: conversation("today", "Is Plex up?", "Plex is up.") })

    await user.click(screen.getByTestId("admin-assistant-history-delete-older"))
    await user.click(within(await screen.findByTestId("admin-assistant-delete-dialog")).getByTestId("admin-assistant-delete-confirm"))
    expect(await screen.findByText("That conversation is already gone")).toBeInTheDocument()

    jest.mocked(deleteAssistantConversation).mockResolvedValueOnce({ success: true, data: null })
    await user.click(screen.getByTestId("admin-assistant-delete-confirm"))
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1))
    expect(router.replace).not.toHaveBeenCalled()
  })

  it("opens in a sheet below lg, and the sheet closes when a conversation is picked", async () => {
    const user = userEvent.setup()
    view({ history })

    await user.click(screen.getByTestId("admin-assistant-history-open"))
    const sheet = await screen.findByRole("dialog", { name: "History" })
    expect(await axe(document.body, noRegion)).toHaveNoViolations()

    await user.click(within(sheet).getByTestId("admin-assistant-history-mobile-item-older"))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "History" })).not.toBeInTheDocument())
  })
})
