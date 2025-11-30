"use client"

import Link from "next/link"

export function RuleActions() {
  return (
    <Link
      href="/admin/maintenance/rules/new"
      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
      data-testid="maintenance-rule-create"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Create Rule
    </Link>
  )
}
