import { notFound } from "next/navigation"
import { connection } from "next/server"

import { RuleEditor } from "@/components/admin/cleanup/editor/rule-editor"
import { assertAdmin } from "@/lib/admin"
import { getCleanupRuleEditor } from "@/lib/data/cleanup-editor"
import { isRedisConfigured } from "@/lib/queue/connection"
import { RULE_ID_PATTERN } from "@/lib/validations/cleanup-actions"

/**
 * One media cleanup rule in the editor (UX 4.3, TS 12.2): breadcrumbs, no
 * section strip. A rule id that cannot be a rule id, a missing rule and a
 * stored rule that does not parse show the not-found page.
 */
export default async function CleanupRulePage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin()
  // The preview reads the newest library data and the clock: render per request
  await connection()
  const { id } = await params
  if (!RULE_ID_PATTERN.test(id)) notFound()
  const now = new Date()
  const data = await getCleanupRuleEditor({ ruleId: id }, now)
  if (!data) notFound()
  return <RuleEditor data={data} now={now.getTime()} redis={isRedisConfigured()} />
}
