/**
 * @jest-environment node
 */

import { escapeHtml, renderEmailHtml } from "@/lib/email/html"
import { greeting, renderEmail, senderLines, type EmailContext } from "@/lib/email/templates/parts"
import { warningEmail, warningStage, type WarningEmailInput } from "@/lib/email/templates/inactivity"
import { testEmail } from "@/lib/email/templates/test-email"

const context = (overrides: Partial<EmailContext> = {}): EmailContext => ({
  serverName: "Northfield Plex",
  appUrl: "https://plex.example.com",
  accent: { fill: "#b45309", ink: "#ffffff" },
  replyTo: null,
  postalAddress: null,
  ...overrides,
})

describe("escapeHtml", () => {
  it("escapes every character that could open markup or end an attribute", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;")
  })
})

describe("greeting", () => {
  it("names the member, or says Hi, with no name", () => {
    expect(greeting("Sam")).toBe("Hi Sam,")
    expect(greeting("  ")).toBe("Hi,")
    expect(greeting(null)).toBe("Hi,")
  })
})

describe("senderLines", () => {
  it("asks for a reply with EMAIL_REPLY_TO, else links to the app", () => {
    expect(senderLines(context({ replyTo: "help@example.com" }))).toEqual(["Northfield Plex.", "To contact us, reply to this email."])
    expect(senderLines(context())).toEqual(["Northfield Plex.", { text: "To contact us, open", href: "https://plex.example.com" }])
  })

  it("adds the postal address after the server name", () => {
    expect(senderLines(context({ postalAddress: "1 Main Street, Springfield" }))[0]).toBe("Northfield Plex. 1 Main Street, Springfield")
  })
})

describe("renderEmail", () => {
  const body = {
    paragraphs: ["Hi,", { text: "Read", href: "https://plex.example.com/help" }],
    action: { label: "Open", href: "https://plex.example.com" },
    after: ["After the button."],
    footer: ["Footer one.", "Footer two."],
  }

  it("draws the same lines in the text part, with the button as label and link", () => {
    expect(renderEmail("Subject", body, context()).text).toBe(
      "Hi,\n\nRead https://plex.example.com/help\n\nOpen: https://plex.example.com\n\nAfter the button.\n\nFooter one.\nFooter two.\n"
    )
  })

  it("draws a one-column HTML document with the button in the accent colour and the server name as text", () => {
    const { html, subject } = renderEmail("Subject", body, context())

    expect(subject).toBe("Subject")
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain("max-width:560px")
    expect(html).toContain("background-color:#b45309")
    expect(html).toContain("color:#ffffff")
    expect(html).toContain(">Northfield Plex</td>")
    expect(html).toContain('<a href="https://plex.example.com/help"')
    expect(html).toContain("After the button.")
    expect(html).toContain("<title>Subject</title>")
  })

  it("holds the card at 560 pixels in Outlook for Windows, which ignores max-width", () => {
    const { html } = renderEmail("Subject", { paragraphs: ["Hi,"], footer: ["Footer."] }, context())

    const open = '<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->'
    const close = "<!--[if mso]></td></tr></table><![endif]-->"
    const card = html.indexOf("max-width:560px")
    expect(html.indexOf(open)).toBeGreaterThan(-1)
    expect(html.indexOf(open)).toBeLessThan(card)
    expect(html.indexOf(close)).toBeGreaterThan(html.lastIndexOf("Footer."))
    expect(html.indexOf(close)).toBeLessThan(html.indexOf("</body>"))
  })

  it("leaves the button and the after paragraphs out when there are none", () => {
    const { text, html } = renderEmail("Subject", { paragraphs: ["Hi,"], footer: ["Footer."] }, context())

    expect(text).toBe("Hi,\n\nFooter.\n")
    expect(html).not.toContain('role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px')
  })
})

describe("renderEmailHtml", () => {
  it("escapes the server name, the title, every line and every link", () => {
    const html = renderEmailHtml(
      {
        paragraphs: ["<b>bold</b>", { text: "<i>", href: 'https://x.example.com/"onmouseover="alert(1)' }],
        action: { label: "<Open>", href: "https://x.example.com/?a=1&b=2" },
        footer: ["<footer>"],
      },
      { title: "<title>", serverName: "<script>alert(1)</script>", accent: { fill: "#000000", ink: "#ffffff" } }
    )

    expect(html).not.toMatch(/<script|<b>|<i>|<footer>|<Open>|"onmouseover/i)
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).toContain('href="https://x.example.com/?a=1&amp;b=2"')
  })
})

const UNSUBSCRIBE = "https://plex.example.com/email/unsubscribe?token=abc.def"

const example = (): Omit<WarningEmailInput, "stage"> => ({
  name: "Sam",
  thresholdDays: 180,
  daysLeft: 30,
  removalDate: "October 28, 2026",
  lastActiveDate: "May 1, 2026",
  discordInviteCode: null,
  unsubscribeUrl: UNSUBSCRIBE,
})

const input = (overrides: Partial<WarningEmailInput> = {}): WarningEmailInput => ({ stage: "first", ...example(), ...overrides })

/** The rules every email to a member keeps. */
function expectSafeEmail({ subject, text, html }: { subject: string; text: string; html: string }) {
  expect(`${subject}\n${text}\n${html}`).not.toMatch(/Plex Manager|Wrapped|membership|subscription/i)
  expect(html).not.toMatch(/\ssrc=|background=|url\(/i)
  for (const [, href] of html.matchAll(/href="([^"]*)"/g)) expect(href).toMatch(/^https:\/\//)
  expect(text.trimEnd().endsWith(`Stop these emails: ${UNSUBSCRIBE}`)).toBe(true)
  expect(html).toContain(`href="${UNSUBSCRIBE}"`)
}

describe("warningStage", () => {
  it("names the largest lead first, the smallest or less last, and the rest reminders", () => {
    expect(warningStage(30, [30, 7, 1])).toBe("first")
    expect(warningStage(7, [30, 7, 1])).toBe("reminder")
    expect(warningStage(1, [30, 7, 1])).toBe("last")
    expect(warningStage(2, [30, 7, 3])).toBe("last")
    expect(warningStage(40, [30, 7, 1])).toBe("first")
  })

  it("makes every warning the first email when there is one lead", () => {
    expect(warningStage(3, [3])).toBe("first")
  })
})

describe("warningEmail", () => {
  it("writes the first warning with the date, the days left and the threshold", () => {
    const email = warningEmail(context(), input())

    expect(email.subject).toBe("Keep your Northfield Plex access: watch something before October 28, 2026")
    expect(email.text).toBe(
      [
        "Hi Sam,",
        "Nothing has played on your Northfield Plex account since May 1, 2026.",
        "Northfield Plex removes access from members who do not watch anything for 180 days.\nWe will remove your access on or after October 28, 2026. That is 30 days from now.",
        "To keep your access, watch anything on Plex for a few minutes before October 28, 2026.\nYou do not need to do anything else.",
        "Open Northfield Plex: https://plex.example.com",
        "If your access ends, you can come back later. Ask the server owner for a new invite.",
        `You get this email because you are a member of Northfield Plex.\nNorthfield Plex.\nTo contact us, open https://plex.example.com\nStop these emails: ${UNSUBSCRIBE}`,
      ].join("\n\n") + "\n"
    )
    expectSafeEmail(email)
  })

  it("names the real number of days of a later date, and one day in the singular", () => {
    expect(warningEmail(context(), input({ daysLeft: 32 })).text).toContain("That is 32 days from now.")
    expect(warningEmail(context(), input({ daysLeft: 1 })).text).toContain("That is 1 day from now.")
  })

  it("writes the reminder with the days left in the subject", () => {
    const email = warningEmail(context(), input({ stage: "reminder", daysLeft: 7 }))

    expect(email.subject).toBe("7 days left to keep your Northfield Plex access")
    expect(email.text).toContain("This is a reminder. We will remove your access to Northfield Plex on or after October 28, 2026.\nNothing has played on your account since May 1, 2026.")
    expect(email.text).toContain("watch anything on Plex for a few minutes before October 28, 2026.")
    expect(email.text).not.toContain("You get this email because")
    expect(warningEmail(context(), input({ stage: "reminder", daysLeft: 1 })).subject).toBe("1 day left to keep your Northfield Plex access")
    expectSafeEmail(email)
  })

  it("writes the last warning with on or after in the subject, and today only with one day left", () => {
    const tomorrow = warningEmail(context(), input({ stage: "last", daysLeft: 1 }))
    expect(tomorrow.subject).toBe("Last reminder: your Northfield Plex access ends on or after October 28, 2026")
    expect(tomorrow.text).toContain("This is the last reminder. We will remove your access to Northfield Plex on or after October 28, 2026.")
    expect(tomorrow.text).toContain("watch anything on Plex for a few minutes today.")
    expectSafeEmail(tomorrow)

    const later = warningEmail(context(), input({ stage: "last", daysLeft: 2 }))
    expect(later.text).toContain("watch anything on Plex for a few minutes before October 28, 2026.")
    expect(later.text).not.toContain("today")
  })

  it.each(["first", "reminder", "last"] as const)("says on or after in the body of the %s email", (stage) => {
    expect(warningEmail(context(), input({ stage, daysLeft: 3 })).text).toContain("on or after October 28, 2026")
  })

  it("points to the Discord invite first, then a reply, then the server owner", () => {
    const discord = warningEmail(context({ replyTo: "help@example.com" }), input({ discordInviteCode: "abc 123" }))
    expect(discord.text).toContain("If your access ends, you can come back later. Ask for a new invite in our Discord: https://discord.gg/abc%20123")
    expect(discord.html).toContain('href="https://discord.gg/abc%20123"')

    expect(warningEmail(context({ replyTo: "help@example.com" }), input()).text).toContain(
      "If your access ends, you can come back later. Reply to this email to ask for a new invite."
    )
    expect(warningEmail(context(), input()).text).toContain("Ask the server owner for a new invite.")
  })

  it("has the footer with and without EMAIL_REPLY_TO and EMAIL_POSTAL_ADDRESS", () => {
    const full = warningEmail(context({ replyTo: "help@example.com", postalAddress: "1 Main Street" }), input({ stage: "last", daysLeft: 1 }))
    expect(full.text).toContain(`Northfield Plex. 1 Main Street\nTo contact us, reply to this email.\nStop these emails: ${UNSUBSCRIBE}`)
    expect(full.html).toContain("1 Main Street")
  })

  it("greets a member with no name with Hi, and escapes markup in the names", () => {
    expect(warningEmail(context(), input({ name: null })).text.startsWith("Hi,\n\n")).toBe(true)

    const email = warningEmail(context({ serverName: "<script>x</script>" }), input({ name: "<img src=x>" }))
    expect(email.html).not.toMatch(/<script|<img/i)
    expect(email.html).toContain("&lt;script&gt;x&lt;/script&gt;")
    expect(email.text).toContain("Hi <img src=x>,")
  })
})

describe("testEmail", () => {
  it("is the first warning, marked as a test, with a first line that says the dates are examples", () => {
    const email = testEmail(context(), example())

    expect(email.subject).toBe("[Test] Keep your Northfield Plex access: watch something before October 28, 2026")
    expect(email.text.startsWith("This is a test email from Northfield Plex. The dates are examples.\n\nHi Sam,\n\n")).toBe(true)
    expect(email.text).toContain(warningEmail(context(), input()).text)
    expect(email.html).toContain('href="https://plex.example.com"')
    expectSafeEmail(email)
  })

  it("escapes a server name and an admin name with markup", () => {
    const email = testEmail(context({ serverName: "<script>x</script>" }), { ...example(), name: "<img src=x>" })

    expect(email.html).not.toMatch(/<script|<img/i)
    expect(email.text).toContain("Hi <img src=x>,")
  })
})
