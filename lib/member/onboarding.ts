import "server-only"

import { getHelpData, type HelpData } from "@/lib/member/help"
import { prisma } from "@/lib/prisma"

/** What the onboarding wizard shows one member: the Help guides' props, plus whether Rewind is on. */
export interface OnboardingData extends HelpData {
  /** Rewind is switched on, so Done may promise it. */
  rewind: boolean
}

/**
 * Reads everything onboarding needs on the server (P10.23), so the wizard
 * renders its first step with real props and no client fetch. The guides'
 * props come from {@link getHelpData}, so Help and onboarding never disagree.
 */
export async function getOnboardingData(userId: string): Promise<OnboardingData> {
  const [help, config] = await Promise.all([
    getHelpData(userId),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindEnabled: true } }),
  ])
  return { ...help, rewind: config?.rewindEnabled ?? false }
}
