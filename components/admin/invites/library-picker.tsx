"use client"

import { Alert } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { LibraryListing } from "@/types/invite"

/** "all" shares every library; otherwise the chosen ids. */
export type LibrarySelection = "all" | string[]

interface LibraryPickerProps {
  listing: LibraryListing
  value: LibrarySelection
  onChange: (value: LibrarySelection) => void
  /** "Plex" or "Jellyfin", for the failure copy. */
  serverLabel: string
  error?: string
  /** Offers "All libraries"; the affiliate settings leave it out, since their list is never all. */
  allowAll?: boolean
  /** Prefixes the test ids: `<prefix>-picker`, `<prefix>-<id>`. */
  testIdPrefix?: string
}

/**
 * One library picker for both server types (P10.1): "All libraries" is the
 * default; clearing it lists each library as a Checkbox. A failed listing
 * keeps "All libraries" and says why. Without `allowAll` the list always
 * shows, and a failed listing only says why.
 */
export function LibraryPicker({ listing, value, onChange, serverLabel, error, allowAll = true, testIdPrefix = "invite-library" }: LibraryPickerProps) {
  const all = value === "all"
  const chosen = all ? [] : value
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? (chosen.includes(id) ? chosen : [...chosen, id]) : chosen.filter((item) => item !== id))

  return (
    <fieldset className="flex flex-col gap-3" data-testid={`${testIdPrefix}-picker`}>
      <legend className="mb-1.5 text-ui font-medium text-foreground">Libraries</legend>
      {allowAll && (
        <label className="flex items-center gap-2 text-ui text-foreground">
          <Checkbox
            checked={all}
            onCheckedChange={(checked) => onChange(checked ? "all" : [])}
            disabled={!listing.ok}
            data-testid={`${testIdPrefix}-all`}
          />
          All libraries
        </label>
      )}
      {!listing.ok && (
        <Alert tone="warning" data-testid={`${testIdPrefix}-error`}>
          Can&apos;t list the {serverLabel} libraries. {listing.reason}
          {allowAll && " The invite can still share all of them."}
        </Alert>
      )}
      {listing.ok && !all && (
        <ul aria-label={`${serverLabel} libraries`} className={cn("flex max-h-48 flex-col gap-2 overflow-y-auto", allowAll && "pl-6")}>
          {listing.libraries.length === 0 && <li className="text-ui text-muted-foreground">No libraries found.</li>}
          {listing.libraries.map((library) => (
            <li key={library.id}>
              <label className="flex items-center gap-2 text-ui text-foreground">
                <Checkbox
                  checked={chosen.includes(library.id)}
                  onCheckedChange={(checked) => toggle(library.id, checked)}
                  data-testid={`${testIdPrefix}-${library.id}`}
                />
                {library.name}
                <span className="text-muted-foreground">{library.type}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-label text-destructive" data-testid={`${testIdPrefix}-picker-error`}>
          {error}
        </p>
      )}
    </fieldset>
  )
}
