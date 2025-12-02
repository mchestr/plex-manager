"use client"

import { RuleForm } from "@/components/maintenance/RuleForm"
import Link from "next/link"

export default function NewRulePage() {
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
          <h1 className="text-2xl font-bold text-white mb-2">Create Maintenance Rule</h1>
          <p className="text-slate-400">Define powerful criteria for automated library maintenance</p>
        </div>

        <RuleForm mode="create" />
      </div>
    </div>
  )
}
