/**
 * `/report` in Discord: the link and membership gate, the search kept to the
 * member's libraries, each step's select menu, a show and "Something else"
 * handed to the web, the send through the web's service, and the
 * Report a problem button on `/watching`, which only its own member can use.
 *
 * discord.js is stubbed (jsdom can't load its REST stack); Plex, the library
 * check, the service and the switch are mocked.
 */

jest.mock("discord.js", () => ({
  MessageFlags: { Ephemeral: 64 },
  SlashCommandBuilder: jest.requireActual("../../__tests__/helpers/slash-command-builder-stub").SlashCommandBuilder,
  ...jest.requireActual("../../__tests__/helpers/component-builder-stub"),
}))
jest.mock("@/lib/connections/plex", () => ({ searchPlexMedia: jest.fn() }))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/problem-reports/access", () => ({
  ...jest.requireActual("@/lib/problem-reports/access"),
  memberLibraryAccess: jest.fn(),
  readMemberItem: jest.fn(),
}))
jest.mock("@/lib/problem-reports/service", () => ({ reportProblem: jest.fn() }))
jest.mock("@/lib/problem-reports/evidence", () => ({ memberLastPlay: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/problem-reports/settings", () => ({ getProblemReportSettings: jest.fn() }))
jest.mock("@/lib/discord/services", () => ({ verifyDiscordUser: jest.fn() }))
jest.mock("@/lib/discord/config", () => ({ getDiscordPortalUrl: () => "https://plex.example.com/discord/link" }))
jest.mock("@/lib/env", () => ({ getBaseUrl: () => "https://plex.example.com" }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: async () => "America/Chicago" }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }))

import type { MessageComponentInteraction } from "discord.js"

import { searchPlexMedia, type PlexItemMetadata } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { getActiveService } from "@/lib/data/active-service"
import { verifyDiscordUser, type VerifyDiscordUserResult } from "@/lib/discord/services"
import { memberLastPlay } from "@/lib/problem-reports/evidence"
import { memberLibraryAccess, readMemberItem } from "@/lib/problem-reports/access"
import { reportProblem } from "@/lib/problem-reports/service"
import { getProblemReportSettings } from "@/lib/problem-reports/settings"

import type { InteractionContext } from "../../registry"
import { reportCommand } from "../index"

const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "owner", machineIdentifier: "m" }
const LINKED: VerifyDiscordUserResult = {
  linked: true,
  entitled: true,
  user: { id: "member-1", name: "Member", email: null, plexUserId: "42", primaryAuthService: "plex", timezone: null, isAdmin: false },
}
const MOVIE: PlexItemMetadata = { ratingKey: "555", type: "movie", title: "Heat", year: 1995, ids: {}, librarySectionId: "1", media: [], locations: [] }
const SHOW: PlexItemMetadata = { ...MOVIE, ratingKey: "6999", type: "show", title: "The Office", year: 2005 }

type Edited = { content: string; components: { components: { data: { customId: string; options?: { label: string; value: string }[]; label?: string } }[] }[] }

function slash(title: string, verifiedUser: VerifyDiscordUserResult = LINKED) {
  const interaction = {
    channelId: "channel-1",
    options: { getString: () => title },
    reply: jest.fn(),
    deferReply: jest.fn(),
    editReply: jest.fn(),
    deferred: false,
    replied: false,
  }
  const ctx = { interaction, verifiedUser, discordUserId: "discord-1", channelId: "channel-1" } as unknown as InteractionContext
  return { ctx, interaction }
}

function component(customId: string, { values, userId = "discord-1" }: { values?: string[]; userId?: string } = {}) {
  const interaction = {
    customId,
    values,
    user: { id: userId },
    isStringSelectMenu: () => values !== undefined,
    reply: jest.fn(),
    deferReply: jest.fn(),
    deferUpdate: jest.fn(),
    editReply: jest.fn(),
  }
  return interaction
}

const handleStep = (interaction: ReturnType<typeof component>) =>
  reportCommand.components![0].handle(interaction as unknown as MessageComponentInteraction)
const edited = (interaction: { editReply: jest.Mock }): Edited => interaction.editReply.mock.calls.at(-1)![0]
const firstControl = (message: Edited) => message.components[0].components[0].data

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getProblemReportSettings).mockResolvedValue({ enabled: true })
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(memberLibraryAccess).mockResolvedValue({ all: false, sections: new Set(["1"]) })
  jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: MOVIE, server: SERVER })
  jest.mocked(verifyDiscordUser).mockResolvedValue(LINKED)
  jest.mocked(getActiveService).mockResolvedValue(null)
  jest.mocked(memberLastPlay).mockResolvedValue(null)
})

describe("/report title:", () => {
  it("sends a member who isn't linked to link, and searches nothing", async () => {
    const { ctx, interaction } = slash("heat", { linked: false, entitled: false })

    await reportCommand.handle(ctx)

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Link your account"), flags: 64 }))
    expect(searchPlexMedia).not.toHaveBeenCalled()
  })

  it("asks a linked member without an active membership to renew, and searches nothing", async () => {
    const { ctx, interaction } = slash("heat", { ...LINKED, entitled: false })

    await reportCommand.handle(ctx)

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("membership is not active") }))
    expect(searchPlexMedia).not.toHaveBeenCalled()
  })

  it("says so while problem reports are off", async () => {
    jest.mocked(getProblemReportSettings).mockResolvedValue({ enabled: false })
    const { ctx, interaction } = slash("heat")

    await reportCommand.handle(ctx)

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 })
    expect(edited(interaction).content).toBe("Problem reports are off.")
    expect(searchPlexMedia).not.toHaveBeenCalled()
  })

  it("offers only titles in the member's libraries", async () => {
    jest.mocked(searchPlexMedia).mockResolvedValue({
      success: true,
      data: [
        { ratingKey: "555", type: "movie", title: "Heat", year: 1995, librarySectionId: "1" },
        { ratingKey: "556", type: "movie", title: "Heat 2", year: 2026, librarySectionId: "9" },
        { ratingKey: "7001", type: "episode", title: "Heat Wave", grandparentTitle: "The Office", parentIndex: 2, index: 3, librarySectionId: "1" },
        { ratingKey: "900", type: "artist", title: "Heatwave", librarySectionId: "1" },
      ],
    })
    const { ctx, interaction } = slash("heat")

    await reportCommand.handle(ctx)

    const message = edited(interaction)
    expect(message.content).toBe("Which title has the problem?")
    expect(firstControl(message)).toMatchObject({
      customId: "report:title",
      options: [
        { label: "Heat (1995)", value: "555", description: "Movie" },
        { label: "The Office S2E3: Heat Wave", value: "7001", description: "Episode" },
      ],
    })
  })

  it("goes straight to what's wrong for one match", async () => {
    jest.mocked(searchPlexMedia).mockResolvedValue({ success: true, data: [{ ratingKey: "555", type: "movie", title: "Heat", year: 1995, librarySectionId: "1" }] })
    const { ctx, interaction } = slash("heat")

    await reportCommand.handle(ctx)

    const message = edited(interaction)
    expect(message.content).toBe("What's wrong with Heat \\(1995\\)?")
    expect(firstControl(message).customId).toBe("report:kind:555")
    expect(firstControl(message).options?.map((option) => option.value)).not.toContain("episodes")
  })

  it("says when nothing in the libraries matches, and when the server can't be read", async () => {
    jest.mocked(searchPlexMedia).mockResolvedValue({ success: true, data: [{ ratingKey: "556", type: "movie", title: "Heat 2", librarySectionId: "9" }] })
    const nothing = slash("heat")
    await reportCommand.handle(nothing.ctx)
    expect(edited(nothing.interaction).content).toBe('Nothing in your libraries matches "heat". Try another title.')

    jest.mocked(memberLibraryAccess).mockResolvedValue(null)
    const down = slash("heat")
    await reportCommand.handle(down.ctx)
    expect(edited(down.interaction).content).toBe("We can't reach the server right now. Try again in a few minutes.")
  })
})

describe("the steps", () => {
  it("hands a show to the web, where the member chooses the episode", async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: SHOW, server: SERVER })
    const pick = component("report:title", { values: ["6999"] })

    await handleStep(pick)

    expect(pick.deferUpdate).toHaveBeenCalled()
    expect(readMemberItem).toHaveBeenCalledWith("member-1", "6999")
    expect(edited(pick)).toEqual({ content: "Choose the episode with the problem on the web: https://plex.example.com/report?item=6999", components: [] })
  })

  it("refuses a title outside the member's libraries at any step", async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: false, reason: "NOT_FOUND" })
    const pick = component("report:kind:556", { values: ["playback"] })

    await handleStep(pick)

    expect(edited(pick)).toEqual({ content: "We couldn't find that title in your libraries.", components: [] })
  })

  it("refuses a kind the title doesn't offer, such as episode problems for a movie", async () => {
    const forged = component("report:kind:555", { values: ["episodes"] })

    await handleStep(forged)

    expect(edited(forged).content).toBe("That choice is no longer valid. Run /report again.")
  })

  it("asks which problem of the kind, then confirms with the web's words and button", async () => {
    const kind = component("report:kind:555", { values: ["playback"] })
    await handleStep(kind)
    expect(edited(kind).content).toBe("Which problem does Heat \\(1995\\) have?")
    expect(firstControl(edited(kind))).toMatchObject({ customId: "report:problem:555:playback" })

    const problem = component("report:problem:555:playback", { values: ["no_sound"] })
    await handleStep(problem)
    expect(edited(problem).content).toBe(
      "Heat \\(1995\\): No sound, or the sound cuts out.\nThe server admin will take a look. We'll message you when it's done."
    )
    expect(firstControl(edited(problem))).toMatchObject({ customId: "report:send:555:no_sound", label: "Send to the server admin" })
  })

  it("confirms a blurry picture with Look for a better copy, or with the playback tip when the member's app converted it", async () => {
    jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === "radarr" ? { id: "radarr-1" } : null)) as never)
    const blurry = component("report:problem:555:picture", { values: ["blurry"] })
    await handleStep(blurry)
    expect(edited(blurry).content).toBe("Heat \\(1995\\): Blurry or low quality.\nWe'll look for a better copy. If there isn't one, nothing changes.")
    expect(firstControl(edited(blurry))).toMatchObject({ customId: "report:send:555:blurry", label: "Look for a better copy" })
    expect(memberLastPlay).toHaveBeenCalledWith("42", expect.objectContaining({ ratingKey: "555", type: "movie" }))

    jest.mocked(memberLastPlay).mockResolvedValue({ player: "Phone", transcoded: true, at: "2026-11-08T20:00:00.000Z" })
    const converted = component("report:problem:555:picture", { values: ["blurry"] })
    await handleStep(converted)
    expect(edited(converted).content).toBe(
      "Heat \\(1995\\): Blurry or low quality.\nYour Plex app converted this video while you watched, which lowers quality and can cause buffering. Get the best picture: https://plex.example.com/help#playback\nStill blurry with the quality set to Maximum? Send it to the server admin."
    )
    expect(firstControl(edited(converted))).toMatchObject({ customId: "report:send:555:blurry", label: "Send to the server admin" })
  })

  it("hands Something else to the web, which takes the note", async () => {
    const kind = component("report:kind:555", { values: ["other"] })

    await handleStep(kind)

    expect(edited(kind)).toEqual({ content: "Tell the server admin what's wrong on the web: https://plex.example.com/report?item=555", components: [] })
  })

  it("refuses a problem from another kind, and a value that isn't one", async () => {
    const wrong = component("report:problem:555:playback", { values: ["blurry"] })
    await handleStep(wrong)
    expect(edited(wrong).content).toBe("That choice is no longer valid. Run /report again.")

    const junk = component("report:kind:555", { values: ["anything"] })
    await handleStep(junk)
    expect(edited(junk).content).toBe("That choice is no longer valid. Run /report again.")
  })

  it("sends the report through the web's service, as the member who pressed it", async () => {
    jest.mocked(reportProblem).mockResolvedValue({ ok: true, outcome: "reported", reportId: "r1" })
    const send = component("report:send:555:no_sound")

    await handleStep(send)

    expect(reportProblem).toHaveBeenCalledWith({ userId: "member-1", ratingKey: "555", problem: "no_sound", note: null, toAdmin: false })
    expect(edited(send)).toEqual({ content: "Sent to the server admin. Follow it on the web: https://plex.example.com/report", components: [] })
  })

  it("says when Look for the episodes started, or answers instead of a report", async () => {
    jest.mocked(reportProblem)
      .mockResolvedValueOnce({ ok: true, outcome: "fixing", reportId: "r1", action: "LOOK_FOR_MISSING" })
      .mockResolvedValueOnce({ ok: true, outcome: "answered", reportId: null, answer: { kind: "NOT_AIRED", season: 2, episode: 6, airsAt: "2026-11-14T20:00:00Z" } })

    const fixing = component("report:send:7001:missing_episodes")
    await handleStep(fixing)
    expect(edited(fixing).content).toBe("We'll look for the missing episodes now. Nothing is removed. Follow it on the web: https://plex.example.com/report")

    const answered = component("report:send:7001:missing_episodes")
    await handleStep(answered)
    expect(edited(answered).content).toBe("Season 2, episode 6 comes out Nov 14.")
  })

  it("says when Look for a better copy started, or that the file is the best copy, with Send to the server admin", async () => {
    jest.mocked(reportProblem)
      .mockResolvedValueOnce({ ok: true, outcome: "fixing", reportId: "r1", action: "BETTER_COPY" })
      .mockResolvedValueOnce({ ok: true, outcome: "answered", reportId: null, answer: { kind: "BEST_COPY" } })

    const fixing = component("report:send:555:blurry")
    await handleStep(fixing)
    expect(edited(fixing).content).toBe(
      "We'll look for a better copy now. The one you have keeps playing, and if there isn't a better one, nothing changes. Follow it on the web: https://plex.example.com/report"
    )

    const best = component("report:send:555:blurry")
    await handleStep(best)
    expect(edited(best).content).toBe("This is the best copy the server keeps.")
    expect(firstControl(edited(best))).toMatchObject({ customId: "report:admin:555:blurry", label: "Send to the server admin" })
  })

  it("sends the report to the server admin anyway from that answer", async () => {
    jest.mocked(reportProblem).mockResolvedValue({ ok: true, outcome: "reported", reportId: "r2" })
    const anyway = component("report:admin:555:blurry")

    await handleStep(anyway)

    expect(reportProblem).toHaveBeenCalledWith({ userId: "member-1", ratingKey: "555", problem: "blurry", note: null, toAdmin: true })
    expect(edited(anyway)).toEqual({ content: "Sent to the server admin. Follow it on the web: https://plex.example.com/report", components: [] })
  })

  it("says when the report joined the title's open one, or was refused", async () => {
    jest.mocked(reportProblem).mockResolvedValueOnce({ ok: true, outcome: "joined", reportId: "r1" }).mockResolvedValueOnce({ ok: false, refusal: "RATE_LIMITED", retryAfterSec: 120 })

    const joined = component("report:send:555:no_sound")
    await handleStep(joined)
    expect(edited(joined).content).toMatch(/^This title already had an open report, so yours was added to it\./)

    const limited = component("report:send:555:no_sound")
    await handleStep(limited)
    expect(edited(limited).content).toMatch(/^You've sent a lot of reports\. Try again /)
  })

  it("stops a member who is no longer linked", async () => {
    jest.mocked(verifyDiscordUser).mockResolvedValue({ linked: false, entitled: false })
    const send = component("report:send:555:no_sound")

    await handleStep(send)

    expect(reportProblem).not.toHaveBeenCalled()
    expect(edited(send).content).toContain("Link your account to report a problem")
  })

  it("answers a control this build doesn't know", async () => {
    const stale = component("report:kind:../1")

    await handleStep(stale)

    expect(stale.reply).toHaveBeenCalledWith({ content: "That choice is no longer valid. Run /report again.", flags: 64 })
  })
})

describe("Report a problem on /watching", () => {
  const OWNER = "123456789012345678"

  it("starts the report for the member whose stream it is, in a new message", async () => {
    const press = component(`report:watching:${OWNER}:7001`, { userId: OWNER })
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: { ...MOVIE, ratingKey: "7001", type: "episode", title: "Pilot", showTitle: "The Office", seasonNumber: 1, episodeNumber: 1 }, server: SERVER })

    await handleStep(press)

    expect(press.deferReply).toHaveBeenCalledWith({ flags: 64 })
    expect(readMemberItem).toHaveBeenCalledWith("member-1", "7001")
    expect(edited(press).content).toBe("What's wrong with The Office S1E1\\: Pilot?")
  })

  it("is refused to anyone else, who sees nothing of the title", async () => {
    const press = component(`report:watching:${OWNER}:7001`, { userId: "223456789012345678" })

    await handleStep(press)

    expect(press.reply).toHaveBeenCalledWith({ content: "This button belongs to someone else.", flags: 64 })
    expect(readMemberItem).not.toHaveBeenCalled()
    expect(press.editReply).not.toHaveBeenCalled()
  })

  it("says so while problem reports are off", async () => {
    jest.mocked(getProblemReportSettings).mockResolvedValue({ enabled: false })
    const press = component(`report:watching:${OWNER}:7001`, { userId: OWNER })

    await handleStep(press)

    expect(edited(press).content).toBe("Problem reports are off.")
    expect(readMemberItem).not.toHaveBeenCalled()
  })
})

describe("the command", () => {
  it("registers /report with a required title and no autocomplete, and owns the report: controls", () => {
    const data = reportCommand.data as unknown as { name: string; options: { name: string; required: boolean; autocomplete: boolean }[] }
    expect(data.name).toBe("report")
    expect(data.options).toEqual([expect.objectContaining({ name: "title", required: true, autocomplete: false })])
    expect(reportCommand.autocomplete).toBeUndefined()
    expect(reportCommand.commandType).toBe("PROBLEM_REPORT")
    expect(reportCommand.components?.[0]).toMatchObject({ customIdPrefix: "report:", commandType: "PROBLEM_REPORT" })
  })
})
