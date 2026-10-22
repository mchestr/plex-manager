"use client"

import { Download } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { importPlexUsers } from "@/actions/import-plex-users"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"

/** The users page's primary action: adds every Plex friend who has no account yet. */
export function ImportPlexUsersButton() {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const router = useRouter()

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
        importResult.errors.forEach((error) => toast.showError(error, 6000))
        router.refresh()
      } else {
        toast.showError(importResult.errors[0] ?? "Failed to import Plex users")
      }
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
