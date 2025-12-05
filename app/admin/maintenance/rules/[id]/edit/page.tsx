import { getMaintenanceRule } from "@/actions/maintenance/rules"
import { RuleForm, type MaintenanceRuleData } from "@/components/maintenance/RuleForm"
import type { RuleCriteria } from "@/lib/validations/maintenance"
import Link from "next/link"
import { notFound } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const result = await getMaintenanceRule(id)
  if (!result.success || !result.data) {
    notFound()
  }

  const rule = result.data

  // Transform database rule to form data format
  const initialData: MaintenanceRuleData = {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    mediaType: rule.mediaType,
    criteria: rule.criteria as unknown as RuleCriteria,
    actionType: rule.actionType,
    actionDelayDays: rule.actionDelayDays,
    radarrId: rule.radarrId,
    sonarrId: rule.sonarrId,
    schedule: rule.schedule,
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/maintenance/rules"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 mb-4 transition-colors group"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Rules
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2">Edit Maintenance Rule</h1>
          <p className="text-slate-400">Modify the criteria for &quot;{rule.name}&quot;</p>
        </div>

        <RuleForm mode="edit" initialData={initialData} />
      </div>
    </div>
  )
}
