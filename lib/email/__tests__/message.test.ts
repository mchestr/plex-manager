/**
 * @jest-environment node
 */

import { createTransport } from "nodemailer"

import type { EmailConfig } from "@/lib/email/env-rules"
import { buildMessage, type OutgoingEmail } from "@/lib/email/message"

const config = (overrides: Partial<EmailConfig> = {}): EmailConfig => ({
  server: { host: "smtp.example.com", port: 587, secure: false },
  auth: null,
  from: "noreply@example.com",
  replyTo: null,
  postalAddress: null,
  ...overrides,
})

const email: OutgoingEmail = {
  to: "member@example.com",
  senderName: "Northfield Plex",
  subject: "Hello",
  text: "Hi,\n\nText\n",
  html: "<p>Hi</p>",
}

describe("buildMessage", () => {
  it("sends from the server name and EMAIL_FROM, to the address alone, with both parts", () => {
    expect(buildMessage(config(), email)).toEqual({
      from: { name: "Northfield Plex", address: "noreply@example.com" },
      to: { name: "", address: "member@example.com" },
      envelope: { from: "noreply@example.com", to: ["member@example.com"] },
      subject: "Hello",
      text: "Hi,\n\nText\n",
      html: "<p>Hi</p>",
      headers: { "Auto-Submitted": "auto-generated" },
      disableFileAccess: true,
      disableUrlAccess: true,
    })
  })

  it("adds Reply-To and sends bounces to it with EMAIL_REPLY_TO", () => {
    const message = buildMessage(config({ replyTo: "help@example.com" }), email)

    expect(message.replyTo).toBe("help@example.com")
    expect(message.envelope).toEqual({ from: "help@example.com", to: ["member@example.com"] })
  })

  it("adds a kind of email's own headers, which cannot replace Auto-Submitted", () => {
    const message = buildMessage(config(), { ...email, headers: { "List-Id": "<reminders.example.com>", "Auto-Submitted": "no" } })

    expect(message.headers).toEqual({ "List-Id": { prepared: true, value: "<reminders.example.com>" }, "Auto-Submitted": "auto-generated" })
  })

  it("sends a printable ASCII value as written, and leaves any other value to nodemailer's encoding", () => {
    const message = buildMessage(config(), {
      ...email,
      headers: { "List-Id": '"Northfield Plex access reminders" <access-reminders.example.com>', "X-Name": "Caf\u00e9", "X-Long": "a".repeat(901) },
    })

    expect(message.headers).toEqual({
      "List-Id": { prepared: true, value: '"Northfield Plex access reminders" <access-reminders.example.com>' },
      "X-Name": "Caf\u00e9",
      "X-Long": "a".repeat(901),
      "Auto-Submitted": "auto-generated",
    })
  })

  it("keeps the subject, the sender name and each header on one line", () => {
    const message = buildMessage(config(), {
      ...email,
      senderName: "Evil\r\nBcc: someone@example.com",
      subject: "Hi\r\nBcc: someone@example.com",
      headers: { "X-Test": "a\nb" },
    })

    expect(message.subject).toBe("Hi Bcc: someone@example.com")
    expect(message.from).toEqual({ name: "Evil Bcc: someone@example.com", address: "noreply@example.com" })
    expect(message.headers).toMatchObject({ "X-Test": { prepared: true, value: "a b" } })
  })

  it("writes the list headers into the raw message unencoded and unbroken", async () => {
    const url = `https://plex.example.com/api/email/unsubscribe?token=${"a".repeat(60)}.${"b".repeat(43)}`
    const message = buildMessage(config(), {
      ...email,
      headers: {
        "List-Unsubscribe": `<${url}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "List-Id": '"Northfield Plex access reminders" <access-reminders.example.com>',
      },
    })

    const info = await createTransport({ streamTransport: true, buffer: true }).sendMail(message)
    const head = `\r\n${info.message.toString().split("\r\n\r\n")[0]}\r\n`

    expect(head).toContain(`\r\nList-Unsubscribe: <${url}>\r\n`)
    expect(head).toContain("\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n")
    // nodemailer writes the name as List-ID; header names are case-insensitive
    expect(head).toMatch(/\r\nList-Id: "Northfield Plex access reminders" <access-reminders\.example\.com>\r\n/i)
    expect(head).not.toContain("=?")
  })
})
