"use server"

/**
 * The first-run setup wizard's saves. Until setup completes only the browser
 * that claimed the server with the setup code may call them (P11.32,
 * `lib/setup/claim.ts`); after that only an admin may.
 *
 * The service saves run the same flow as settings (`saveServiceConnection`,
 * P10.24): test, then make the row the service's one active row, and move the
 * wizard on in the same transaction. Every save and Skip moves the wizard to
 * the later of where it is and the step after the one saved, so saving again
 * after Back never moves progress backwards. Saves are audited as
 * `CONFIG_CHANGED` with the actor `setup` during the first run.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { setupAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionErrorCode, type ActionResult } from "@/lib/actions/result"
import { testLLMProviderConnection } from "@/lib/connections/llm-provider"
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/provider-presets"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import type { SecretRequiredCode } from "@/lib/security/secret-reuse"
import { SERVICE_DESCRIPTORS, type ServiceKind } from "@/lib/services/descriptors"
import { saveServiceConnection } from "@/lib/services/service-save"
import { clearSetupClaimCookie } from "@/lib/setup/claim"
import { discordIntegrationSchema } from "@/lib/validations/discord"
import { setupLLMProviderSchema } from "@/lib/validations/llm-provider"
import {
  nextStepId,
  OPTIONAL_SETUP_STEP_IDS,
  parseSetupPosition,
  stepIndex,
  type SetupPosition,
  type SetupStepId,
} from "@/types/setup"

type SetupCode = ActionErrorCode | SecretRequiredCode

function auditSetupSave(actor: string, section: string, after: Record<string, unknown>, secretFields: string[] = []) {
  logAuditEvent(AuditEventType.CONFIG_CHANGED, actor, configDiff(`setup.${section}`, null, after, { secretFields }))
}

/** The wizard's row and position, or null before its first save. */
async function wizardRow(tx: PrismaTransactionClient): Promise<{ id: string; position: SetupPosition } | null> {
  const setup = await tx.setup.findFirst({ orderBy: { createdAt: "desc" } })
  return setup && { id: setup.id, position: parseSetupPosition(setup.currentStepId) ?? "plex" }
}

/**
 * Moves the wizard past `from`: to `nextStepId(from)`, unless it is already
 * further on (a save after Back). Creates the row on the first save.
 */
async function advanceSetup(tx: PrismaTransactionClient, from: SetupStepId) {
  const next = nextStepId(from)
  const setup = await wizardRow(tx)
  if (!setup) {
    await tx.setup.create({ data: { currentStepId: next } })
  } else if (stepIndex(next) > stepIndex(setup.position)) {
    await tx.setup.update({ where: { id: setup.id }, data: { currentStepId: next } })
  }
}

/** A service step's save: the shared flow, plus the wizard's step in its transaction. */
function serviceSave<K extends ServiceKind>(kind: K, step: SetupStepId) {
  const service = SERVICE_DESCRIPTORS[kind]
  return setupAction({
    input: service.input,
    fallbackError: `Failed to save ${service.label} configuration`,
    handler: async (input, { actor }): Promise<ActionResult<null, SetupCode>> => {
      const result = await saveServiceConnection(kind, input, {
        actor,
        section: `setup.${kind}`,
        within: (tx) => advanceSetup(tx, step),
      })
      if (result.success) revalidatePath("/setup")
      return result
    },
  })
}

/** Saves the Plex server and records its owner as the admin. */
export const savePlexServer = serviceSave("plex", "plex")

export const saveTautulli = serviceSave("tautulli", "tautulli")

export const saveOverseerr = serviceSave("overseerr", "overseerr")

export const saveSonarr = serviceSave("sonarr", "sonarr")

export const saveRadarr = serviceSave("radarr", "radarr")

export const savePrometheus = serviceSave("prometheus", "prometheus")

/** Saves the Discord integration. The client secret goes only to Discord, so it keeps "blank means keep". */
export const saveDiscordIntegration = setupAction({
  input: discordIntegrationSchema,
  fallbackError: "Failed to save Discord integration",
  handler: async (validated, { actor }) => {
    const isEnabled = validated.isEnabled ?? false
    const botEnabled = validated.botEnabled ?? false

    if (isEnabled && (!validated.clientId || !validated.clientSecret)) {
      return fail("VALIDATION", "Client ID and Client Secret are required when enabling Discord integration")
    }

    const row = {
      isEnabled,
      botEnabled,
      clientId: validated.clientId,
      clientSecret: validated.clientSecret,
      guildId: validated.guildId,
      serverInviteCode: validated.serverInviteCode,
      platformName: validated.platformName,
      instructions: validated.instructions,
    }

    await prisma.$transaction(async (tx) => {
      await advanceSetup(tx, "discord")
      await tx.discordIntegration.upsert({
        where: { id: "discord" },
        update: row,
        create: { id: "discord", ...row },
      })
    })

    auditSetupSave(actor, "discord", row, ["clientSecret"])
    revalidatePath("/setup")
    revalidatePath("/discord/link")
    revalidatePath("/admin/settings")
    return ok(null)
  },
})

/** Saves an OpenAI provider for `purpose`, replacing that purpose's active one. Setup checks the key only. */
function llmProviderSave(purpose: "chat" | "wrapped", step: SetupStepId) {
  return setupAction({
    input: setupLLMProviderSchema,
    fallbackError: "Failed to save LLM provider configuration",
    handler: async (validated, { actor }) => {
      // The model field is free text, as before P2.12
      const connectionTest = await testLLMProviderConnection(validated, { customModel: true })
      if (!connectionTest.success) {
        return fail("UPSTREAM_UNAVAILABLE", connectionTest.error || "Failed to connect to LLM provider")
      }

      const model = validated.model || DEFAULT_OPENAI_MODEL
      await prisma.$transaction(async (tx) => {
        await advanceSetup(tx, step)
        await tx.lLMProvider.updateMany({ where: { isActive: true, purpose }, data: { isActive: false } })
        await tx.lLMProvider.create({
          data: {
            provider: validated.provider,
            purpose,
            apiKey: validated.apiKey,
            model,
            temperature: validated.temperature ?? null,
            maxTokens: validated.maxTokens ?? null,
            isActive: true,
          },
        })
      })

      // Setup is OpenAI only, so the key always goes to api.openai.com
      auditSetupSave(actor, `llm.${purpose}`, { provider: validated.provider, model, apiKey: validated.apiKey }, ["apiKey"])
      revalidatePath("/setup")
      return ok(null)
    },
  })
}

/** Saves the admin assistant's provider. */
export const saveChatLLMProvider = llmProviderSave("chat", "llm-chat")

/** Saves the Rewind writer's provider. */
export const saveLLMProvider = llmProviderSave("wrapped", "llm-rewind")

/**
 * Skip for now on an optional step: moves the wizard on without writing a
 * service row. Plex and Tautulli are refused (`VALIDATION`), and so is a step
 * the wizard has not reached yet (`CONFLICT`).
 */
export const skipSetupStep = setupAction({
  input: z.object({ stepId: z.enum(OPTIONAL_SETUP_STEP_IDS, { message: "This step can't be skipped" }) }),
  fallbackError: "Failed to skip this step",
  handler: async ({ stepId }, { actor }) => {
    const skipped = await prisma.$transaction(async (tx) => {
      const position = (await wizardRow(tx))?.position ?? "plex"
      if (stepIndex(stepId) > stepIndex(position)) return false
      await advanceSetup(tx, stepId)
      return true
    })
    if (!skipped) return fail("CONFLICT", "Finish the earlier steps first")

    logAuditEvent(AuditEventType.SETUP_STEP_SKIPPED, actor, { stepId })
    revalidatePath("/setup")
    return ok(null)
  },
})

/** Marks setup complete and ends the claim; from then on these saves are admin only. */
export const completeSetup = setupAction({
  input: z.undefined(),
  fallbackError: "Failed to finish setup",
  handler: async (_input, { actor }) => {
    const setup = await prisma.setup.findFirst({ orderBy: { createdAt: "desc" } })
    if (setup) {
      await prisma.setup.update({
        where: { id: setup.id },
        data: { isComplete: true, completedAt: new Date(), claimId: null, claimCodeHash: null },
      })
    }
    await clearSetupClaimCookie()

    auditSetupSave(actor, "complete", { isComplete: true })
    revalidatePath("/")
    return ok(null)
  },
})
