/**
 * Tests for the shared `requireLinkedUser` slash-command guard.
 *
 * discord.js is stubbed the same way the command tests stub it (jsdom can't load
 * the @discordjs/rest → undici stack); we only need `MessageFlags.Ephemeral`.
 */

jest.mock("discord.js", () => ({
  MessageFlags: { Ephemeral: 64 },
}))

import type { VerifyDiscordUserResult } from "../../services"
import type { InteractionContext } from "../registry"
import { DEFAULT_LINK_NUDGE, requireLinkedUser } from "../require-linked-user"

const linkedUser: VerifyDiscordUserResult = {
  linked: true,
  user: {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    plexUserId: "plex-1",
    isAdmin: false,
  },
}

function createContext(options: {
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

  const ctx = {
    interaction,
    verifiedUser: options.linked === false ? { linked: false } : linkedUser,
    discordUserId: "discord-1",
    channelId: "channel-1",
  } as unknown as InteractionContext

  return { ctx, reply, editReply }
}

describe("requireLinkedUser", () => {
  it("returns the resolved user and sends no reply when linked", async () => {
    const { ctx, reply, editReply } = createContext()

    const user = await requireLinkedUser(ctx)

    expect(user).toEqual(linkedUser.user)
    expect(reply).not.toHaveBeenCalled()
    expect(editReply).not.toHaveBeenCalled()
  })

  it("replies ephemerally with the default nudge and returns null when unlinked", async () => {
    const { ctx, reply, editReply } = createContext({ linked: false })

    const user = await requireLinkedUser(ctx)

    expect(user).toBeNull()
    expect(reply).toHaveBeenCalledWith({
      content: DEFAULT_LINK_NUDGE,
      flags: 64,
    })
    expect(editReply).not.toHaveBeenCalled()
  })

  it("uses a custom message when provided", async () => {
    const { ctx, reply } = createContext({ linked: false })

    const user = await requireLinkedUser(ctx, { message: "Link first, please." })

    expect(user).toBeNull()
    expect(reply).toHaveBeenCalledWith({
      content: "Link first, please.",
      flags: 64,
    })
  })

  it("edits the reply (not reply) when the interaction is already deferred", async () => {
    const { ctx, reply, editReply } = createContext({
      linked: false,
      deferred: true,
    })

    const user = await requireLinkedUser(ctx)

    expect(user).toBeNull()
    expect(editReply).toHaveBeenCalledWith({ content: DEFAULT_LINK_NUDGE })
    expect(reply).not.toHaveBeenCalled()
  })

  it("edits the reply when the interaction has already been replied to", async () => {
    const { ctx, reply, editReply } = createContext({
      linked: false,
      replied: true,
    })

    const user = await requireLinkedUser(ctx)

    expect(user).toBeNull()
    expect(editReply).toHaveBeenCalledWith({ content: DEFAULT_LINK_NUDGE })
    expect(reply).not.toHaveBeenCalled()
  })
})
