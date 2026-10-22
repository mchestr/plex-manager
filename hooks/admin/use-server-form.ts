"use client"

import { useRouter } from "next/navigation"

import {
  updateJellyfinServer,
  updateOverseerr,
  updatePlexServer,
  updatePrometheus,
  updateRadarr,
  updateSonarr,
  updateTautulli,
} from "@/actions/admin"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"

export type ServerType = "plex" | "jellyfin" | "tautulli" | "overseerr" | "sonarr" | "radarr" | "prometheus"

/**
 * The active server config, with secrets stripped. `hasToken`/`hasApiKey`
 * say a secret is stored (never the value itself), so a blank secret field
 * keeps it.
 */
export interface StoredServer {
  name: string
  url: string
  publicUrl?: string | null
  query?: string
  hasToken?: boolean
  hasApiKey?: boolean
}

export interface ServerFormValues {
  name: string
  url: string
  publicUrl: string
  /** The Plex token or the API key, as typed; blank keeps the stored one. */
  secret: string
  query: string
}

export const SERVER_LABELS: Record<ServerType, string> = {
  plex: "Plex",
  jellyfin: "Jellyfin",
  tautulli: "Tautulli",
  overseerr: "Overseerr",
  sonarr: "Sonarr",
  radarr: "Radarr",
  prometheus: "Prometheus",
}

const API_KEY_ACTIONS = {
  jellyfin: updateJellyfinServer,
  tautulli: updateTautulli,
  overseerr: updateOverseerr,
  sonarr: updateSonarr,
  radarr: updateRadarr,
}

function save(type: ServerType, values: ServerFormValues) {
  const secret = values.secret.trim() || undefined
  const publicUrl = values.publicUrl || undefined
  if (type === "plex") return updatePlexServer({ name: values.name, url: values.url, token: secret, publicUrl })
  if (type === "prometheus") return updatePrometheus({ name: values.name, url: values.url, query: values.query })
  return API_KEY_ACTIONS[type]({ name: values.name, url: values.url, apiKey: secret, publicUrl })
}

/** One service's always-open form (UI-31): values, dirty state, Discard and Save. */
export function useServerForm(type: ServerType, server: StoredServer | null) {
  const router = useRouter()
  const toast = useToast()
  const initial: ServerFormValues = {
    name: server?.name ?? "",
    url: server?.url ?? "",
    publicUrl: server?.publicUrl ?? "",
    secret: "",
    query: server?.query ?? "",
  }

  const settings = useSettingsForm(initial, async (values) => {
    const result = await save(type, values)
    if (!result.success) {
      toast.showError(result.error || `Could not save the ${SERVER_LABELS[type]} settings`)
      return
    }
    toast.showSuccess(`${SERVER_LABELS[type]} settings saved`)
    router.refresh()
    return { ...values, secret: "" }
  })

  return {
    ...settings,
    hasStoredSecret: type === "plex" ? Boolean(server?.hasToken) : Boolean(server?.hasApiKey),
  }
}
