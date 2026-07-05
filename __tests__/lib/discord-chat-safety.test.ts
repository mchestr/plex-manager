import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"

describe("sanitizeDiscordResponse", () => {
  it("redacts email addresses", () => {
    const { content, redacted } = sanitizeDiscordResponse("Contact john@example.com for help")
    expect(redacted).toBe(true)
    expect(content).toContain("[redacted]")
    expect(content).not.toContain("john@example.com")
  })

  it("redacts phone numbers", () => {
    const { content, redacted } = sanitizeDiscordResponse("Call me at 555-123-4567")
    expect(redacted).toBe(true)
    expect(content).toBe("Call me at [redacted]")
  })

  it("redacts IP addresses and trims whitespace", () => {
    const { content, redacted } = sanitizeDiscordResponse("Server IP 10.0.0.5  ")
    expect(redacted).toBe(true)
    expect(content).toBe("Server IP [redacted]")
  })

  it("returns original text when nothing was redacted", () => {
    const text = "Plex status looks good."
    const { content, redacted } = sanitizeDiscordResponse(text)
    expect(redacted).toBe(false)
    expect(content).toBe(text)
  })

  it("redacts full IPv6 addresses", () => {
    const { content, redacted } = sanitizeDiscordResponse(
      "Client connected from 2001:0db8:85a3:0000:0000:8a2e:0370:7334 earlier"
    )
    expect(redacted).toBe(true)
    expect(content).not.toContain("2001:0db8")
    expect(content).toContain("[redacted]")
  })

  it("redacts compressed IPv6 addresses entirely (no trailing groups leak)", () => {
    const { content, redacted } = sanitizeDiscordResponse("Address 2001:db8::8a2e:370:7334 seen")
    expect(redacted).toBe(true)
    // The whole address must be gone — not just the leading groups. JS regex
    // alternation is first-match-wins, so a too-narrow tail would leave
    // ":370:7334" dangling next to the redaction marker.
    expect(content).not.toContain("2001:db8")
    expect(content).not.toContain("8a2e")
    expect(content).not.toContain("370:7334")
    expect(content).toBe("Address [redacted] seen")
  })

  it("redacts loopback IPv6 (::1)", () => {
    const { content, redacted } = sanitizeDiscordResponse("Bound to ::1 locally")
    expect(redacted).toBe(true)
    expect(content).not.toContain("::1")
  })

  it("redacts Discord snowflake ids (17-19 digit numbers)", () => {
    const { content, redacted } = sanitizeDiscordResponse("User 123456789012345678 asked about it")
    expect(redacted).toBe(true)
    expect(content).not.toContain("123456789012345678")
    expect(content).toBe("User [redacted] asked about it")
  })

  it("redacts long hex identifiers (e.g. Plex machine identifier)", () => {
    const machineId = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4"
    const { content, redacted } = sanitizeDiscordResponse(`Machine ${machineId} is online`)
    expect(redacted).toBe(true)
    expect(content).not.toContain(machineId)
  })

  it("redacts labelled ids", () => {
    const { content, redacted } = sanitizeDiscordResponse("plex user id: 4815162342")
    expect(redacted).toBe(true)
    expect(content).not.toContain("4815162342")
  })

  it("does not redact short benign numbers (queue size, versions)", () => {
    const text = "Queue size is 3 and version is 4.0.14."
    const { content, redacted } = sanitizeDiscordResponse(text)
    expect(redacted).toBe(false)
    expect(content).toBe(text)
  })

  it("does not redact benign short years or counts", () => {
    const text = "Added 12 items in 2024."
    const { content, redacted } = sanitizeDiscordResponse(text)
    expect(redacted).toBe(false)
    expect(content).toBe(text)
  })
})


