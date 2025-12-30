"use client"

import { useMemo, useState } from "react"
import { StyledDropdown } from "@/components/ui/select"

export interface UsersFilter {
  plexAccess: "all" | "yes" | "no" | "unknown"
  role: "all" | "admin" | "user"
}

interface UsersFilterProps {
  onFilterChange: (filter: UsersFilter) => void
  defaultFilter?: Partial<UsersFilter>
}

export function UsersFilter({ onFilterChange, defaultFilter }: UsersFilterProps) {
  const [filter, setFilter] = useState<UsersFilter>({
    plexAccess: defaultFilter?.plexAccess ?? "yes",
    role: defaultFilter?.role ?? "all",
  })

  const updateFilter = (updates: Partial<UsersFilter>) => {
    const newFilter = { ...filter, ...updates }
    setFilter(newFilter)
    onFilterChange(newFilter)
  }

  const handleClear = () => {
    const clearedFilter: UsersFilter = {
      plexAccess: "yes",
      role: "all",
    }
    setFilter(clearedFilter)
    onFilterChange(clearedFilter)
  }

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filter.plexAccess !== "yes") count++
    if (filter.role !== "all") count++
    return count
  }, [filter])

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg mb-4 relative z-20">
      {/* Header with gradient accent */}
      <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/50 border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600/20 to-purple-600/20 border border-cyan-500/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Filters</h3>
              <p className="text-xs text-slate-400">Refine your user list</p>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs font-medium rounded-full border border-cyan-500/30">
                {activeFilterCount} active
              </span>
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700/80 border border-slate-600 hover:border-slate-500 rounded-lg transition-all duration-200 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reset
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter controls */}
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative z-30 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Plex Access
            </label>
            <StyledDropdown
              value={filter.plexAccess}
              onChange={(value) => updateFilter({ plexAccess: value as UsersFilter["plexAccess"] })}
              options={[
                { value: "all", label: "All" },
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
                { value: "unknown", label: "Unknown" },
              ]}
              size="sm"
              id="users-filter-plex-access"
              name="plexAccess"
              data-testid="users-filter-plex-access"
            />
          </div>
          <div className="relative z-30 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Role
            </label>
            <StyledDropdown
              value={filter.role}
              onChange={(value) => updateFilter({ role: value as UsersFilter["role"] })}
              options={[
                { value: "all", label: "All" },
                { value: "admin", label: "Admin" },
                { value: "user", label: "User" },
              ]}
              size="sm"
              id="users-filter-role"
              name="role"
              data-testid="users-filter-role"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

