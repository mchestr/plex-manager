/**
 * The assistants' prompts state the turn's zone and local time (P11.17,
 * GAP-44): the member's zone in Discord, the server zone with its offset in
 * the admin chat.
 */

import { generateSystemPrompt } from "@/lib/chatbot/prompts/default-system-prompt"
import { generateDiscordSystemPrompt } from "@/lib/chatbot/prompts/discord-system-prompt"

// 17:05 in Berlin (CET, +01:00) and 08:05 in Los Angeles (PST, -08:00)
const NOW = new Date("2026-12-01T16:05:00Z")

describe("generateDiscordSystemPrompt", () => {
  it("holds the member's zone and local time for Europe/Berlin in en-GB", () => {
    const prompt = generateDiscordSystemPrompt([], { format: { timeZone: "Europe/Berlin", locale: "en-GB" }, now: NOW })

    expect(prompt).toContain("Member time zone: Europe/Berlin. Local time now: 1 Dec 2026, 17:05.")
  })
})

describe("generateSystemPrompt", () => {
  it("states the server zone and the local time with its offset, not UTC", () => {
    const prompt = generateSystemPrompt([], { timeZone: "America/Los_Angeles", locale: "en-US" }, NOW)

    expect(prompt).toContain("Server time zone: America/Los_Angeles")
    expect(prompt).toContain("Local time now: 2026-12-01T08:05:00-08:00 (Dec 1, 2026, 8:05 AM PST)")
    expect(prompt).not.toContain(NOW.toISOString())
  })
})
