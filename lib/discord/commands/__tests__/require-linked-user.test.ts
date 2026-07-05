/**
 * Tests for the shared `requireLinkedUser` slash-command guard.
 *
 * discord.js is stubbed the same way the command tests stub it (jsdom can't load
 * the @discordjs/rest → undici stack); we only need `MessageFlags.Ephemeral`.
 *
 * `@/lib/discord/config` is mocked so `getDiscordPortalUrl()` returns a stable URL
 * without transitively loading `lib/prisma` (which needs DATABASE_URL under jest).
 */

jest.mock("discord.js", () => ({
  MessageFlags: { Ephemeral: 64 },
}))

const PORTAL_URL = "https://example.com/discord/link"

jest.mock("@/lib/discord/config", () => ({
  getDiscordPortalUrl: () => PORTAL_URL,
}))

import type { VerifyDiscordUserResult } from "../../services"
import type { InteractionContext } from "../registry"
import {
  buildNotEntitledMessage,
  buildNotLinkedMessage,
  requireLinkedUser,
} from "../require-linked-user"

const linkedUser: VerifyDiscordUserResult = {
  linked: true,
  entitled: true,
  user: {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    plexUserId: "plex-1",
    isAdmin: false,
  },
}

function createContext(options: {
  /** `false` → not linked; `"unentitled"` → linked but not entitled; else linked + entitled. */
  verifiedUser?: VerifyDiscordUserResult
  linked?: boolean
  deferred?: boolean
  replied?: boolean
} = {}): {
  ctx: InteractionContext
  reply: jest.Mock
  editReply: jest.Mock
} {
  const reply = jest.fn().mockResolvedValue(undefined)
  const editReply = jest.fn().mockResolvedValue(undefined)

  const interaction = {
    channelId: "channel-1",
    deferred: options.deferred ?? false,
    replied: options.replied ?? false,
    reply,
    editReply,
  }

  const verifiedUser =
    options.verifiedUser ??
    (options.linked === false
      ? ({ linked: false, entitled: false } as VerifyDiscordUserResult)
      : linkedUser)

  const ctx = {
    interaction,
    verifiedUser,
    discordUserId: "discord-1",
    channelId: "channel-1",
  } as unknown as InteractionContext

  return { ctx, reply, editReply }
}

describe("requireLinkedUser", () => {
  it("returns the resolved user and sends no reply when linked and entitled", async () => {
    const { ctx, reply, editReply } = createContext()

    const user = await requireLinkedUser(ctx)

    expect(user).toEqual(linkedUser.user)
    expect(reply).not.toHaveBeenCalled()
    expect(editReply).not.toHaveBeenCalled()
  })

  it("replies ephemerally with the link nudge (portal URL) and returns null when unlinked", async () => {
    const { ctx, reply, editReply } = createContext({ linked: false })

    const user = await requireLinkedUser(ctx)

    expect(user).toBeNull()
    expect(reply).toHaveBeenCalledWith({
      content: expect.stringContaining(PORTAL_URL),
      flags: 64,
    })
    // The default nudge asks the user to link their account.
    expect(reply.mock.calls[0][0].content).toMatch(/link your account/i)
    expect(editReply).not.toHaveBeenCalled()
  })

  it("uses the `action` override in the not-linked nudge", async () => {
    const { ctx, reply } = createContext({ linked: false })

    const user = await requireLinkedUser(ctx, { action: "viewing your marks" })

    expect(user).toBeNull()
    expect(reply).toHaveBeenCalledWith({
      content: buildNotLinkedMessage("viewing your marks"),
      flags: 64,
    })
    expect(reply.mock.calls[0][0].content).toContain("viewing your marks")
  })

  it("replies ephemerally with the subscription nudge and returns null when linked but not entitled", async () => {
    const unentitled: VerifyDiscordUserResult = {
      linked: true,
      entitled: false,
      user: linkedUser.user,
    }
    const { ctx, reply, editReply } = createContext({ verifiedUser: unentitled })

    const user = await requireLinkedUser(ctx)

    expect(user).toBeNull()
    expect(reply).toHaveBeenCalledWith({
      content: buildNotEntitledMessage(),
      flags: 64,
    })
    // The subscription nudge is distinct from the link nudge.
    expect(reply.mock.calls[0][0].content).toMatch(/active membership|subscription|unavailable/i)
    expect(editReply).not.toHaveBeenCalled()
  })

  it("edits the reply (not reply) when the interaction is already deferred", async () => {
    const { ctx, reply, editReply } = createContext({
      linked: false,
      deferred: true,
    })

    const user = await requireLinkedUser(ctx)

    expect(user).toBeNull()
    expect(editReply).toHaveBeenCalledWith({
      content: buildNotLinkedMessage(),
    })
    expect(reply).not.toHaveBeenCalled()
  })

  it("edits the reply when the interaction has already been replied to", async () => {
    const { ctx, reply, editReply } = createContext({
      linked: false,
      replied: true,
    })

    const user = await requireLinkedUser(ctx)

    expect(user).toBeNull()
    expect(editReply).toHaveBeenCalledWith({
      content: buildNotLinkedMessage(),
    })
    expect(reply).not.toHaveBeenCalled()
  })
})
