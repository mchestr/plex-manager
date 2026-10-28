"use client"

import Link from "next/link"
import { useTransition } from "react"

import { recheckConnections } from "@/actions/admin/connection-health"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { assistant } from "@/lib/admin/routes"
import { icons } from "@/lib/ui/icons"

/** The settings page actions (6.4): "Test all connections" (secondary) and the Assistant. */
export function SettingsPageActions() {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  const testAll = () =>
    startTransition(async () => {
      const result = await recheckConnections()
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      const broken = Object.values(result.data).filter((health) => health.status === "unreachable").length
      if (broken > 0) toast.showError(broken === 1 ? "1 connection is not working" : `${broken} connections are not working`)
      else toast.showSuccess("All connections answered")
    })

  return (
    <>
      <Button
        variant="ghost"
        icon={<Icon icon={icons.assistant} />}
        render={<Link href={assistant()} />}
        nativeButton={false}
        data-testid="settings-assistant"
      >
        Assistant
      </Button>
      <Button
        variant="secondary"
        icon={<Icon icon={icons.testConnection} />}
        onClick={testAll}
        loading={isPending}
        loadingLabel="Testing"
        data-testid="settings-test-all"
      >
        Test all connections
      </Button>
    </>
  )
}
