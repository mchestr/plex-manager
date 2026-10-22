"use client"

import { Download } from "lucide-react"
import { useTransition } from "react"

import { importPlexUsers } from "@/actions/import-plex-users"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"

/** The users page's primary action: adds every Plex friend who has no account yet. */
export function ImportPlexUsersButton() {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const handleImport = () => {
    startTransition(async () => {
      const result = await importPlexUsers()
      if (!result.success) {
        toast.showError(result.error)
        return
      }

      const { imported, skipped, errors } = result.data
      const parts = [`Imported ${imported} user${imported !== 1 ? "s" : ""}`]
      if (skipped > 0) {
        parts.push(`${skipped} skipped (already exist)`)
      }
      if (errors.length > 0) {
        parts.push(`${errors.length} error${errors.length !== 1 ? "s" : ""}`)
      }

      toast.showSuccess(parts.join(", "))
      errors.forEach((error) => toast.showError(error))
    })
  }

  return (
    <Button
      variant="primary"
      onClick={handleImport}
      loading={isPending}
      loadingLabel="Importing"
      icon={<Icon icon={Download} />}
      data-testid="admin-users-import"
    >
      Import from Plex
    </Button>
  )
}
