/**
 * @jest-environment node
 */

import { escapeHtml, renderEmailHtml } from "@/lib/email/html"
import { greeting, renderEmail, senderLines, type EmailContext } from "@/lib/email/templates/parts"
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

describe("testEmail", () => {
  it("is marked as a test, greets the admin and links to the app", () => {
    const email = testEmail(context(), "Sam", UNSUBSCRIBE)

    expect(email.subject).toBe("[Test] Email from Northfield Plex")
    expect(email.text).toContain("Hi Sam,")
    expect(email.text).toContain("This is a test email from Northfield Plex.")
    expect(email.text).toContain("Open Northfield Plex: https://plex.example.com")
    expect(email.html).toContain('href="https://plex.example.com"')
  })

  it("has the footer with and without EMAIL_REPLY_TO and EMAIL_POSTAL_ADDRESS", () => {
    const plain = testEmail(context(), null, UNSUBSCRIBE).text
    expect(plain).toContain("Northfield Plex.\nTo contact us, open https://plex.example.com\nStop these emails: " + UNSUBSCRIBE + "\n")

    const full = testEmail(context({ replyTo: "help@example.com", postalAddress: "1 Main Street" }), null, UNSUBSCRIBE)
    expect(full.text).toContain("Northfield Plex. 1 Main Street\nTo contact us, reply to this email.\nStop these emails: ")
    expect(full.html).toContain("1 Main Street")
  })

  it("ends the footer with the unsubscribe link in both parts", () => {
    const email = testEmail(context(), "Sam", UNSUBSCRIBE)

    expect(email.text.trimEnd().endsWith(`Stop these emails: ${UNSUBSCRIBE}`)).toBe(true)
    expect(email.html).toContain(`href="${UNSUBSCRIBE}"`)
  })

  it("escapes a server name and an admin name with markup", () => {
    const email = testEmail(context({ serverName: "<script>x</script>" }), "<img src=x>", UNSUBSCRIBE)

    expect(email.html).not.toMatch(/<script|<img/i)
    expect(email.text).toContain("Hi <img src=x>,")
  })

  it("never names the app, uses only absolute links and loads nothing remote", () => {
    const { subject, text, html } = testEmail(context(), "Sam", UNSUBSCRIBE)
    const all = `${subject}\n${text}\n${html}`

    expect(all).not.toMatch(/Plex Manager|Wrapped/i)
    expect(html).not.toMatch(/\ssrc=|background=|url\(/i)
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) expect(href).toMatch(/^https:\/\//)
  })
})
