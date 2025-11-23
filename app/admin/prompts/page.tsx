import { getPromptTemplates } from "@/actions/prompts"
import Link from "next/link"

export const dynamic = 'force-dynamic'

export default async function PromptsPage() {
  const result = await getPromptTemplates()
  const templates = result.success ? result.data : []

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Prompt Templates</h1>
                <p className="text-sm text-slate-400">
                  Manage and configure prompt templates for generating wrapped content
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/admin/prompts/new"
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white text-sm font-medium rounded transition-all"
                >
                  + New Template
                </Link>
              </div>
            </div>
          </div>

          {/* Templates Table */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/30 border-b border-slate-700">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                      Description
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                      Version
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                      Updated
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {templates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-4">
                          <p>No prompt templates found</p>
                          <Link
                            href="/admin/prompts/new"
                            className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white rounded-lg font-medium transition-all"
                          >
                            Create Your First Template
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    templates.map((template) => (
                      <tr key={template.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-3 sm:px-6 py-4">
                          <div className="text-sm font-medium text-white">
                            {template.name}
                          </div>
                          {template.description && (
                            <div className="text-xs text-slate-400 mt-1 md:hidden truncate max-w-[200px]">
                              {template.description}
                            </div>
                          )}
                        </td>
                        <td className="px-3 sm:px-6 py-4 hidden md:table-cell">
                          <div className="text-sm text-slate-300 max-w-md truncate">
                            {template.description || <span className="text-slate-500">—</span>}
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4">
                          {template.isActive ? (
                            <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs font-medium rounded">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-slate-700/50 text-slate-400 text-xs font-medium rounded">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-3 sm:px-6 py-4 hidden lg:table-cell">
                          <div className="text-sm text-slate-300">
                            v{template.version}
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 hidden lg:table-cell">
                          <div className="text-sm text-slate-300">
                            {formatDate(template.updatedAt)}
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/prompts/${template.id}`}
                              className="px-2 sm:px-3 py-1 sm:py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded transition-colors"
                            >
                              <span className="hidden sm:inline">View</span>
                              <span className="sm:hidden">View</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </div>
    </div>
  )
}
