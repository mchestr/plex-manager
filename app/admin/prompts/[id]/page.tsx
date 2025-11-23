import { getPromptTemplate } from "@/actions/prompts"
import { ExpandablePrompt } from "@/components/admin/prompts/expandable-prompt"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PromptTemplateActions } from "@/components/admin/prompts/prompt-template-actions"

export const dynamic = 'force-dynamic'

export default async function PromptTemplatePage({
  params,
}: {
  params: { id: string }
}) {
  const result = await getPromptTemplate(params.id)
  if (!result.success || !result.data) {
    notFound()
  }

  const template = result.data

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Link
              href="/admin/prompts"
              className="text-sm text-cyan-400 hover:text-cyan-300 mb-4 inline-block"
            >
              ← Back to Prompt Templates
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                  {template.name}
                </h1>
                <p className="text-sm text-slate-400">
                  {template.description || "Prompt template details and configuration"}
                </p>
              </div>
              <PromptTemplateActions template={template} />
            </div>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Status</div>
              <div className="mt-2">
                {template.isActive ? (
                  <span className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 text-sm font-medium rounded">
                    Active
                  </span>
                ) : (
                  <span className="px-3 py-1.5 bg-slate-700/50 text-slate-400 text-sm font-medium rounded">
                    Inactive
                  </span>
                )}
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Version</div>
              <div className="text-lg font-bold text-white">
                v{template.version}
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Created</div>
              <div className="text-sm text-white">
                {formatDate(template.createdAt)}
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Last Updated</div>
              <div className="text-sm text-white">
                {formatDate(template.updatedAt)}
              </div>
            </div>
          </div>

          {/* Template Content */}
          <ExpandablePrompt
            content={template.template}
            title="Template Content"
            characterCount={template.template.length}
          />
      </div>
    </div>
  )
}
