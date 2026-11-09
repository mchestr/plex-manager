/**
 * The HTML part of an email: one column at most 560 pixels wide, table
 * layout and inline styles, so Outlook and webmail draw it the same. Outlook
 * for Windows ignores `max-width`, so a fixed 560-pixel table in an
 * Outlook-only conditional comment holds the card there. The
 * header is the server name as text. There is no image of any kind: a
 * remote image would tell the sender when a member opens the email.
 *
 * Every value goes through {@link escapeHtml}; the layout is the only markup.
 *
 * @module lib/email/html
 */

import "server-only"

import { themes } from "@/lib/design/tokens"

/** One line of an email: text, or text followed by a link that shows its own address. */
export type EmailLine = string | { text: string; href: string }

/** An email's content, which the text part and the HTML part both draw. */
export interface EmailBody {
  /** The greeting and the paragraphs before the button. */
  paragraphs: EmailLine[]
  /** The main link: a button in HTML, "label: href" in text. */
  action?: { label: string; href: string }
  /** Paragraphs after the button. */
  after?: EmailLine[]
  /** The footer, one line each. */
  footer: EmailLine[]
}

/** The button colours: the accent and the text colour that reads on it. */
export interface EmailAccent {
  fill: string
  ink: string
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

/**
 * `value` safe in HTML text and in a quoted attribute.
 *
 * @internal The layout below escapes every value; a template that writes its own markup uses it too.
 *
 * @example
 * ```ts
 * escapeHtml('<b>"Tom" & Jerry\'s</b>') // "&lt;b&gt;&quot;Tom&quot; &amp; Jerry&#39;s&lt;/b&gt;"
 * ```
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}

const ink = themes.light
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
const TEXT = `${FONT}font-size:16px;line-height:24px;color:${ink.foreground.hex};`
const SMALL = `${FONT}font-size:13px;line-height:20px;color:${ink["muted-foreground"].hex};`
const LINK = `color:${ink.foreground.hex};text-decoration:underline;`

function line(value: EmailLine): string {
  if (typeof value === "string") return escapeHtml(value)
  const href = escapeHtml(value.href)
  return `${escapeHtml(value.text)} <a href="${href}" style="${LINK}">${href}</a>`
}

/** Outlook for Windows only: a fixed-width table, since it ignores the card's `max-width`. */
const MSO_OPEN = '<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->'
const MSO_CLOSE = "<!--[if mso]></td></tr></table><![endif]-->"

const paragraph = (value: EmailLine, style: string) => `<p style="margin:0 0 16px;${style}">${line(value)}</p>`

function button(action: NonNullable<EmailBody["action"]>, accent: EmailAccent): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>',
    `<td style="border-radius:6px;background-color:${accent.fill};">`,
    `<a href="${escapeHtml(action.href)}" style="display:inline-block;padding:12px 20px;${FONT}font-size:16px;font-weight:bold;color:${accent.ink};text-decoration:none;border-radius:6px;">${escapeHtml(action.label)}</a>`,
    "</td></tr></table>",
  ].join("")
}

/** The whole HTML document for `body`. */
export function renderEmailHtml(body: EmailBody, options: { title: string; serverName: string; accent: EmailAccent }): string {
  const content = [
    ...body.paragraphs.map((value) => paragraph(value, TEXT)),
    body.action ? button(body.action, options.accent) : "",
    ...(body.after ?? []).map((value) => paragraph(value, TEXT)),
  ].join("")
  const footer = body.footer.map((value) => `<p style="margin:0 0 4px;${SMALL}">${line(value)}</p>`).join("")
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light">',
    `<title>${escapeHtml(options.title)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:${ink.background.hex};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${ink.background.hex};"><tr><td align="center" style="padding:24px 12px;">`,
    MSO_OPEN,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${ink.card.hex};border:1px solid ${ink.border.hex};border-radius:8px;">`,
    `<tr><td style="padding:24px 32px 8px;${FONT}font-size:18px;line-height:24px;font-weight:bold;color:${ink.foreground.hex};">${escapeHtml(options.serverName)}</td></tr>`,
    `<tr><td style="padding:8px 32px 8px;">${content}</td></tr>`,
    `<tr><td style="padding:16px 32px 24px;border-top:1px solid ${ink.border.hex};">${footer}</td></tr>`,
    "</table>",
    MSO_CLOSE,
    "</td></tr></table></body></html>",
  ].join("")
}
