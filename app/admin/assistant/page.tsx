import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AssistantWorkspace } from "@/components/admin/assistant/assistant-workspace"
import { assertPermission } from "@/lib/admin"
import { getAssistantPage } from "@/lib/data/assistant-history"
import { recordIdSchema } from "@/lib/validations/params"

export const metadata: Metadata = { title: "Assistant" }

interface AssistantPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The admin assistant, for an admin or a role holding `assistant:use`: a new
 * conversation, or one of the caller's as `?conversation=<id>`. The
 * conversation is a search param, not a path segment, because the router
 * keeps one page for every search param: the transcript's state carries over
 * when a new conversation's URL takes its id, and no hidden copy of the page
 * stays behind for "New conversation" to bring back.
 */
export default async function AssistantPage({ searchParams }: AssistantPageProps) {
  const session = await assertPermission("assistant:use")
  const asked = (await searchParams).conversation
  const parsed = asked === undefined ? null : recordIdSchema.safeParse(asked)
  if (parsed && !parsed.success) notFound()

  const conversationId = parsed?.data ?? null
  const data = await getAssistantPage(conversationId)
  if (conversationId && !data.conversation) notFound()

  return <AssistantWorkspace {...data} now={new Date().getTime()} canConfigure={session.user.isAdmin} />
}
