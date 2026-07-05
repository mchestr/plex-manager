/**
 * @jest-environment node
 */

/**
 * Guards the Step 14 cut-over to interactions/DM-only.
 *
 * After Step 14 the bot no longer reads guild channel message *content*, so the
 * `MessageContent` (and `GuildMessages`) privileged intents must be gone. It
 * still needs `Guilds` (slash-command / component interactions) and
 * `DirectMessages` + `Partials.Channel` (the DM assistant).
 *
 * The `!`-prefix text-command handlers (`handleMarkCommand`,
 * `handleSelectionResponse`, `MARK_COMMANDS`, `handleHelpCommand`,
 * `HELP_COMMANDS`) that the removed `MessageCreate` branches called are deleted;
 * this file also asserts they are no longer exported.
 */

// bot.ts transitively imports the routers → command registry → prisma-backed
// modules, and the config resolver (which eagerly instantiates prisma at import
// time), none of which we exercise here. Stub them so importing bot.ts only
// builds the discord.js client factory under test.
jest.mock("../routing/interaction-router", () => ({ routeInteraction: jest.fn() }))
jest.mock("../routing/dm-router", () => ({
  routeDirectMessage: jest.fn(),
  defaultDmRouteDeps: jest.fn(),
}))
jest.mock("../config", () => ({
  getDiscordBotToken: jest.fn(),
  getSupportChannelId: jest.fn(),
  getSupportThreadIds: jest.fn(),
}))

import { GatewayIntentBits, Partials } from "discord.js"
import { DiscordBot, defaultClientFactory } from "../bot"
import * as config from "../config"
import * as helpModule from "../commands/help"

const mockGetDiscordBotToken = config.getDiscordBotToken as jest.Mock
const mockGetSupportChannelId = config.getSupportChannelId as jest.Mock

describe("defaultClientFactory intents (Step 14 cut-over)", () => {
  const client = defaultClientFactory()

  afterAll(() => {
    // Never logged in, but destroy for good hygiene.
    void client.destroy()
  })

  it("does NOT request the MessageContent privileged intent", () => {
    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(false)
  })

  it("does NOT request the GuildMessages intent", () => {
    expect(client.options.intents.has(GatewayIntentBits.GuildMessages)).toBe(false)
  })

  it("requests Guilds (for slash-command / component interactions)", () => {
    expect(client.options.intents.has(GatewayIntentBits.Guilds)).toBe(true)
  })

  it("requests DirectMessages (for the DM assistant)", () => {
    expect(client.options.intents.has(GatewayIntentBits.DirectMessages)).toBe(true)
  })

  it("registers the Channel partial so DM messageCreate events are emitted", () => {
    expect(client.options.partials).toContain(Partials.Channel)
  })
})

describe("required configuration (token-only startup)", () => {
  // A minimal fake discord.js Client: records login, no-ops the event wiring.
  function makeFakeClient() {
    const login = jest.fn().mockResolvedValue("token")
    const client = {
      once: jest.fn(),
      on: jest.fn(),
      login,
      destroy: jest.fn().mockResolvedValue(undefined),
    }
    return { client: client as unknown as import("discord.js").Client, login }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("initializes with only a bot token (no support channel)", async () => {
    mockGetDiscordBotToken.mockResolvedValue("bot-token")
    mockGetSupportChannelId.mockResolvedValue(undefined)

    const { client, login } = makeFakeClient()
    const bot = new DiscordBot(() => client)

    await bot.initialize()

    expect(login).toHaveBeenCalledWith("bot-token")
  })

  it("still initializes when a support channel is present", async () => {
    mockGetDiscordBotToken.mockResolvedValue("bot-token")
    mockGetSupportChannelId.mockResolvedValue("support-channel-id")

    const { client, login } = makeFakeClient()
    const bot = new DiscordBot(() => client)

    await bot.initialize()

    expect(login).toHaveBeenCalledWith("bot-token")
  })

  it("does NOT initialize without a bot token", async () => {
    mockGetDiscordBotToken.mockResolvedValue(undefined)
    mockGetSupportChannelId.mockResolvedValue("support-channel-id")

    const factory = jest.fn(() => makeFakeClient().client)
    const bot = new DiscordBot(factory)

    await bot.initialize()

    // No client is ever built when the token is missing.
    expect(factory).not.toHaveBeenCalled()
  })
})

describe("legacy !-prefix text handlers are removed", () => {
  it("media-marking module (text handlers + MARK_COMMANDS) no longer exists", () => {
    expect(() => require("../commands/media-marking")).toThrow()
  })

  it("help module no longer exports the text handleHelpCommand / HELP_COMMANDS", () => {
    expect(helpModule).not.toHaveProperty("handleHelpCommand")
    expect(helpModule).not.toHaveProperty("HELP_COMMANDS")
  })

  it("help module still exports the retained slash surface and helpers", () => {
    expect(helpModule).toHaveProperty("helpCommand")
    expect(helpModule).toHaveProperty("COMMAND_REGISTRY")
    expect(helpModule).toHaveProperty("findCommand")
    expect(helpModule).toHaveProperty("buildFullHelpMessage")
    expect(helpModule).toHaveProperty("buildCommandHelpMessage")
  })
})
