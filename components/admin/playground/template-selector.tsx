"use client"

import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { PromptTemplate } from "@/lib/generated/prisma/client"

interface TemplateSelectorProps {
  templates: PromptTemplate[]
  selectedTemplateId: string
  onTemplateChange: (templateId: string) => void
}

export function TemplateSelector({
  templates,
  selectedTemplateId,
  onTemplateChange,
}: TemplateSelectorProps) {
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg shadow-slate-900/20">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Template Selection
        </h2>
        <p className="text-xs text-slate-400 mt-1">Choose which prompt template to test</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Select Template
        </label>
        <StyledDropdown
          value={selectedTemplateId}
          onChange={onTemplateChange}
          options={templates.map((template) => ({
            value: template.id,
            label: `${template.name}${template.isActive ? " (Active)" : ""}`,
          }))}
          size="md"
        />
        {selectedTemplate && (
          <p className="mt-1.5 text-xs text-slate-400">
            {selectedTemplate.description || "No description"}
          </p>
        )}
      </div>
    </div>
  )
}

