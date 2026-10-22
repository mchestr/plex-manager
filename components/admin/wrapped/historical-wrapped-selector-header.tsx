"use client"

import { Check, ChevronDown, History } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { rewindHistory, userRewind } from "@/lib/admin/routes"

interface HistoricalVersionOption {
  id: string
  /** "Oct 12, 2026, 2:26 PM CDT", formatted on the server. */
  label: string
  /** "openai/gpt-5 · $0.02" */
  detail: string
  isCurrent: boolean
}

interface HistoricalWrappedSelectorHeaderProps {
  wrappedId: string
  userId: string
  /** The Rewind's year: "Current" opens that year, not the season year. */
  year: number
  /** The version this page shows. */
  selectedId: string
  versions: HistoricalVersionOption[]
}

/** The history page's version picker (P10.6): the versions come in as props. */
export function HistoricalWrappedSelectorHeader({ wrappedId, userId, year, selectedId, versions }: HistoricalWrappedSelectorHeaderProps) {
  if (versions.length === 0) return null
  const selected = versions.find((version) => version.id === selectedId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" data-testid="admin-wrapped-version-picker" />}>
        <Icon icon={History} />
        {selected?.label ?? "Versions"}
        <span className="text-muted-foreground">({versions.length})</span>
        <Icon icon={ChevronDown} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 min-w-72 overflow-y-auto">
        {versions.map((version) => (
          <DropdownMenuLinkItem
            key={version.id}
            render={<Link href={version.isCurrent ? userRewind(userId, year) : rewindHistory(wrappedId, version.id)} />}
            icon={version.id === selectedId ? <Icon icon={Check} /> : <span className="size-4" aria-hidden="true" />}
            className="h-auto py-1.5"
            data-testid={`admin-wrapped-version-${version.id}`}
          >
            <span className="flex flex-col">
              <span>
                {version.label}
                {version.isCurrent && " (current)"}
              </span>
              <span className="text-caption text-muted-foreground">{version.detail}</span>
            </span>
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
