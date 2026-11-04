"use client"

import { removeArrService } from "@/actions/admin/admin-servers"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useActionDialog } from "@/hooks/use-action-dialog"

type ArrService = "sonarr" | "radarr"

const LABELS: Record<ArrService, string> = { sonarr: "Sonarr", radarr: "Radarr" }

const CONSEQUENCES: Record<ArrService, string> = {
  sonarr:
    "The assistant can no longer look up shows, Rewind leaves out returning shows and Discord media marks lose their Sonarr links. The stored API key is deleted. You can set Sonarr up again at any time.",
  radarr:
    "The assistant can no longer look up movies and Discord media marks lose their Radarr links. The stored API key is deleted. You can set Radarr up again at any time.",
}

const remove = (service: ArrService) => removeArrService({ service })

/** Remove in a Sonarr or Radarr row, behind a confirm. */
export function RemoveArrServiceButton({ service }: { service: ArrService }) {
  const label = LABELS[service]
  const { run } = useActionDialog(remove, { success: `${label} removed` })
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" data-testid={`settings-other-${service}-remove`}>
          Remove
          <span className="sr-only"> {label}</span>
        </Button>
      }
      title={`Remove ${label}?`}
      description={CONSEQUENCES[service]}
      confirmLabel={`Remove ${label}`}
      pendingLabel="Removing"
      tone="destructive"
      action={() => run(service)}
      data-testid={`settings-other-${service}-remove-dialog`}
      confirmTestId={`settings-other-${service}-remove-confirm`}
    />
  )
}
