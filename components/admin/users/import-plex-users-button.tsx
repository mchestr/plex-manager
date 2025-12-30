"use client"

import { importPlexUsers } from "@/actions/import-plex-users"
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
    <button
      onClick={handleImport}
      disabled={isPending}
      className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
    >
      {isPending ? "Importing..." : "Import Plex Users"}
    </button>
  )
}

