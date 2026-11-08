/**
 * What every email says about its sender, read at send time: the server
 * name (`serverName()`), the app link, the button colour from the accent
 * colour (Appearance), and the reply and postal addresses of the mail set-up.
 *
 * @module lib/email/context
 */

import "server-only"

import { serverName } from "@/lib/brand"
import { accentTokens } from "@/lib/branding/accent"
import { getBranding } from "@/lib/branding/settings"
import { themes } from "@/lib/design/tokens"
import type { EmailConfig } from "@/lib/email/env-rules"
import type { EmailContext } from "@/lib/email/templates/parts"
import { getBaseUrl } from "@/lib/env"

/** The default accent when none is saved: the dark theme's primary amber. */
const DEFAULT_ACCENT = themes.dark.primary.hex

/** The sender's context for a template, with `config`'s reply and postal addresses. */
export async function loadEmailContext(config: EmailConfig): Promise<EmailContext> {
  const [name, branding] = await Promise.all([serverName(), getBranding()])
  // On a white email, the light theme's fill and the ink that reads on it
  const tokens = accentTokens(branding.accentColor ?? DEFAULT_ACCENT).light
  return {
    serverName: name,
    appUrl: getBaseUrl().replace(/\/+$/, ""),
    accent: { fill: tokens.primary, ink: tokens["primary-foreground"] },
    replyTo: config.replyTo,
    postalAddress: config.postalAddress,
  }
}
