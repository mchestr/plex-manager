import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPromptTemplate } from "@/actions/prompts"
import { getUserPlexWrapped } from "@/actions/user-queries"
import { PromptTemplateEditor } from "@/components/admin/prompts/prompt-template-editor"
import Link from "next/link"
import { notFound } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function EditPromptTemplatePage({
  params,
}: {
  params: Promise<{ promptId: string }>
}) {
  const session = await getServerSession(authOptions)
  const { promptId } = await params

  const result = await getPromptTemplate(promptId)
  if (!result.success || !result.data) {
    notFound()
  }

  // Get current user's wrapped data for placeholder examples
  const currentYear = new Date().getFullYear()
  const userWrapped = session?.user?.id
    ? await getUserPlexWrapped(session.user.id, currentYear)
    : null

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <Link
              href={`/admin/prompts/${promptId}`}
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 mb-6 transition-colors group"
            >
              <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Template Details
            </Link>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  Edit Prompt Template
                </h1>
                <p className="text-sm text-slate-400">
                  Modify the prompt template and preview how placeholders are replaced with your data
                </p>
              </div>
            </div>
          </div>

          <PromptTemplateEditor
            template={result.data}
            userWrapped={userWrapped}
            userName={session?.user?.name || "User"}
          />
      </div>
    </div>
  )
}

