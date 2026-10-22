"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StyledDropdown } from "@/components/ui/styled-dropdown"

export interface UsersFilter {
  plexAccess: "all" | "yes" | "no" | "unknown"
  role: "all" | "admin" | "user"
  subscription: "all" | "active" | "past_due" | "canceled" | "none"
}

interface UsersFilterProps {
  onFilterChange: (filter: UsersFilter) => void
  defaultFilter?: Partial<UsersFilter>
}

export function UsersFilter({ onFilterChange, defaultFilter }: UsersFilterProps) {
  const [filter, setFilter] = useState<UsersFilter>({
    plexAccess: defaultFilter?.plexAccess ?? "yes",
    role: defaultFilter?.role ?? "all",
    subscription: defaultFilter?.subscription ?? "all",
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
      subscription: "all",
    }
    setFilter(clearedFilter)
    onFilterChange(clearedFilter)
  }

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filter.plexAccess !== "yes") count++
    if (filter.role !== "all") count++
    if (filter.subscription !== "all") count++
    return count
  }, [filter])

  return (
    <Card className="relative z-20 mb-4">
      <CardHeader>
        <CardTitle as="h2" className="text-ui font-semibold">Filters</CardTitle>
        <CardDescription className="text-label">Refine your user list</CardDescription>
        {activeFilterCount > 0 && (
          <CardAction className="flex items-center gap-2">
            <Badge variant="info">{activeFilterCount} active</Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClear}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reset
            </Button>
          </CardAction>
        )}
      </CardHeader>

      {/* Filter controls */}
      <CardContent className="pb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative z-30 space-y-1.5">
            <label htmlFor="users-filter-plex-access" className="flex items-center gap-1.5 text-label font-medium text-foreground">
              <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <label htmlFor="users-filter-role" className="flex items-center gap-1.5 text-label font-medium text-foreground">
              <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="relative z-30 space-y-1.5">
            <label htmlFor="users-filter-subscription" className="flex items-center gap-1.5 text-label font-medium text-foreground">
              <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Subscription
            </label>
            <StyledDropdown
              value={filter.subscription}
              onChange={(value) => updateFilter({ subscription: value as UsersFilter["subscription"] })}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "past_due", label: "Past due" },
                { value: "canceled", label: "Canceled" },
                { value: "none", label: "None" },
              ]}
              size="sm"
              id="users-filter-subscription"
              name="subscription"
              data-testid="users-filter-subscription"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

