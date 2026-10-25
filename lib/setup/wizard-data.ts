/**
 * What the setup page reads for the wizard (P10.25), after it has checked the
 * claim: which steps have a saved config (done or skipped in the Stepper, and
 * the summary's lists), and the saved values of the step on screen, so a step
 * revisited with Back shows "Saved" and the last four characters. Secrets
 * leave as `{ last4, origin }` only (`describeSecret`, SEC-31).
 *
 * @module lib/setup/wizard-data
 */

import "server-only"

import { cookies } from "next/headers"

import type { StoredDiscordIntegration } from "@/components/admin/settings/discord-integration-form"
import type { StoredServer } from "@/hooks/admin/use-server-form"
import { readSetupPinCookie, SETUP_PLEX_PIN_COOKIE } from "@/lib/plex-pin-cookie"
import { prisma } from "@/lib/prisma"
import { describeSecret } from "@/lib/security/secret-reuse"
import type { SetupPosition, SetupStepId, SetupStoredLLM } from "@/types/setup"

export interface SetupWizardData {
  /** Steps with a saved config; a passed step without one was skipped. */
  configured: Record<SetupStepId, boolean>
  /** The step on screen's saved values, when it has any. */
  stored: {
    server?: StoredServer | null
    llm?: SetupStoredLLM | null
    discord?: StoredDiscordIntegration | null
  }
  /** A Connect with Plex is under way in this browser (back from plex.tv). */
  plexPending: boolean
}

const active = { where: { isActive: true }, orderBy: { updatedAt: "desc" } } as const

function storedServer(row: { name: string; url: string; publicUrl?: string | null } | null, secret: string | null | undefined): StoredServer | null {
  return row && { name: row.name, url: row.url, publicUrl: row.publicUrl ?? null, secret: describeSecret(secret, row.url) }
}

async function storedFor(position: SetupPosition): Promise<SetupWizardData["stored"]> {
  switch (position) {
    case "plex": {
      const row = await prisma.plexServer.findFirst(active)
      return { server: storedServer(row, row?.token) }
    }
    case "tautulli":
    case "overseerr":
    case "sonarr":
    case "radarr": {
      const delegate = { tautulli: prisma.tautulli, overseerr: prisma.overseerr, sonarr: prisma.sonarr, radarr: prisma.radarr }[position]
      // Each delegate's findFirst has its own signature; the shared row shape is all this needs
      const row = await (delegate.findFirst as (args: typeof active) => Promise<{ name: string; url: string; publicUrl: string | null; apiKey: string } | null>)(active)
      return { server: storedServer(row, row?.apiKey) }
    }
    case "prometheus": {
      const row = await prisma.prometheus.findFirst(active)
      return { server: row && { name: row.name, url: row.url, query: row.query } }
    }
    case "llm-rewind":
    case "llm-chat": {
      const purpose = position === "llm-chat" ? "chat" : "wrapped"
      const row = await prisma.lLMProvider.findFirst({ where: { isActive: true, purpose, provider: "openai", baseUrl: null } })
      return {
        llm: row && {
          model: row.model,
          temperature: row.temperature,
          maxTokens: row.maxTokens,
          // Setup sends this key to OpenAI only, a fixed destination
          secret: describeSecret(row.apiKey),
        },
      }
    }
    case "discord": {
      const row = await prisma.discordIntegration.findUnique({ where: { id: "discord" } })
      if (!row) return { discord: null }
      const { clientSecret, botToken, ...rest } = row
      return { discord: { ...rest, secrets: { clientSecret: describeSecret(clientSecret), botToken: describeSecret(botToken) } } }
    }
    case "summary":
      return {}
  }
}

/** The wizard's data for `position`; the caller has checked the claim. */
export async function getSetupWizardData(position: SetupPosition): Promise<SetupWizardData> {
  const [plex, tautulli, overseerr, sonarr, radarr, wrapped, chat, discord, prometheus, stored, jar] = await Promise.all([
    prisma.plexServer.count(active),
    prisma.tautulli.count(active),
    prisma.overseerr.count(active),
    prisma.sonarr.count(active),
    prisma.radarr.count(active),
    prisma.lLMProvider.count({ where: { isActive: true, purpose: "wrapped" } }),
    prisma.lLMProvider.count({ where: { isActive: true, purpose: "chat" } }),
    prisma.discordIntegration.count({ where: { OR: [{ isEnabled: true }, { botEnabled: true }] } }),
    prisma.prometheus.count(active),
    storedFor(position),
    cookies(),
  ])
  return {
    configured: {
      plex: plex > 0,
      tautulli: tautulli > 0,
      overseerr: overseerr > 0,
      sonarr: sonarr > 0,
      radarr: radarr > 0,
      "llm-rewind": wrapped > 0,
      "llm-chat": chat > 0,
      discord: discord > 0,
      prometheus: prometheus > 0,
    },
    stored,
    plexPending: readSetupPinCookie(jar.get(SETUP_PLEX_PIN_COOKIE)?.value) !== null,
  }
}
