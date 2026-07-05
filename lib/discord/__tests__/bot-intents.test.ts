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
// modules, which we don't exercise here. Stub the routers so importing bot.ts
// only builds the discord.js client factory under test.
jest.mock("../routing/interaction-router", () => ({ routeInteraction: jest.fn() }))
jest.mock("../routing/dm-router", () => ({
  routeDirectMessage: jest.fn(),
  defaultDmRouteDeps: jest.fn(),
}))

import { GatewayIntentBits, Partials } from "discord.js"
import { defaultClientFactory } from "../bot"
import * as helpModule from "../commands/help"

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
