"use client"

import { importPlexUsers } from "@/actions/import-plex-users"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/sonner"
import { useTransition } from "react"

export function ImportPlexUsersButton() {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const handleImport = () => {
    startTransition(async () => {
      const importResult = await importPlexUsers()

      if (importResult.success) {
        const parts = [`Imported ${importResult.imported} user${importResult.imported !== 1 ? "s" : ""}`]
        if (importResult.skipped > 0) {
          parts.push(`${importResult.skipped} skipped (already exist)`)
        }
        if (importResult.errors.length > 0) {
          parts.push(`${importResult.errors.length} error${importResult.errors.length !== 1 ? "s" : ""}`)
        }

        toast.showSuccess(parts.join(", "), 5000)

        // Show errors separately if any
        if (importResult.errors.length > 0) {
          importResult.errors.forEach((error) => {
            toast.showError(error, 6000)
          })
        }
      } else {
        const errorMessage = importResult.errors.length > 0
          ? importResult.errors[0]
          : "Failed to import Plex users"
        toast.showError(errorMessage)
      }
    })
  }

  return (
    <Button
      onClick={handleImport}
      disabled={isPending}
      variant="primary"
      size="sm"
    >
      {isPending ? "Importing..." : "Import Plex Users"}
    </Button>
  )
}

