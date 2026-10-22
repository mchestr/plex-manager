import "server-only"

import { prisma } from "@/lib/prisma"
import { assistantDisclosure } from "@/lib/ui/privacy-copy"

/**
 * The assistant disclosure naming the active chat provider (P11.16): read on
 * the server for the Discord bot, `/help`, the sign-in pass and the account
 * page. No active chat provider names the fallback.
 */
export async function getAssistantDisclosure(): Promise<string> {
  const row = await prisma.lLMProvider.findFirst({
    where: { isActive: true, purpose: "chat" },
    select: { provider: true },
  })
  return assistantDisclosure(row?.provider ?? null)
}
