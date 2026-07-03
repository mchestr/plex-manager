"use client"

import { updateOverseerr, updatePlexServer, updatePrometheus, updateRadarr, updateSonarr, updateTautulli, updateJellyfinServer } from "@/actions/admin"
import { Button } from "@/components/ui/button"
import { StyledInput } from "@/components/ui/styled-input"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

interface ServerFormProps {
  type: "plex" | "jellyfin" | "tautulli" | "overseerr" | "sonarr" | "radarr" | "prometheus"
  /**
   * The active server config, with secrets stripped. `hasToken`/`hasApiKey`
   * indicate a secret is stored (never the value itself) so the form can offer
   * "leave blank to keep current value" without exposing the secret.
   */
  server:
    | {
        name: string
        url: string
        publicUrl?: string | null
        query?: string
        hasToken?: boolean
        hasApiKey?: boolean
      }
    | null
}

export function ServerForm({ type, server }: ServerFormProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  // Whether a secret is already stored for this server (drives leave-blank-to-keep).
  const hasStoredSecret = type === "plex" ? Boolean(server?.hasToken) : Boolean(server?.hasApiKey)

  // Secrets are never sent to the client. Empty fields mean "keep existing".
  const [formData, setFormData] = useState({
    name: server?.name || "",
    url: server?.url || "",
    publicUrl: server?.publicUrl || "",
    token: "",
    apiKey: "",
    query: server?.query || "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Blank secret fields are sent as undefined so the action keeps the stored value.
    const token = formData.token.trim() || undefined
    const apiKey = formData.apiKey.trim() || undefined

    startTransition(async () => {
      let result
      if (type === "plex") {
        result = await updatePlexServer({
          name: formData.name,
          url: formData.url,
          token,
          publicUrl: formData.publicUrl || undefined,
        })
      } else if (type === "jellyfin") {
        result = await updateJellyfinServer({
          name: formData.name,
          url: formData.url,
          apiKey,
          publicUrl: formData.publicUrl || undefined,
        })
      } else if (type === "tautulli") {
        result = await updateTautulli({
          name: formData.name,
          url: formData.url,
          apiKey,
          publicUrl: formData.publicUrl || undefined,
        })
      } else if (type === "overseerr") {
        result = await updateOverseerr({
          name: formData.name,
          url: formData.url,
          apiKey,
          publicUrl: formData.publicUrl || undefined,
        })
      } else if (type === "sonarr") {
        result = await updateSonarr({
          name: formData.name,
          url: formData.url,
          apiKey,
          publicUrl: formData.publicUrl || undefined,
        })
      } else if (type === "radarr") {
        result = await updateRadarr({
          name: formData.name,
          url: formData.url,
          apiKey,
          publicUrl: formData.publicUrl || undefined,
        })
      } else {
        // prometheus
        result = await updatePrometheus({
          name: formData.name,
          url: formData.url,
          query: formData.query!,
        })
      }

      if (result.success) {
        setIsEditing(false)
        toast.showSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} configuration updated successfully`)
        router.refresh()
      } else {
        toast.showError(result.error || `Failed to update ${type} configuration`)
      }
    })
  }

  if (!isEditing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {server ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-400 mb-1">Name</div>
                <div className="text-white">{server.name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Local URL</div>
                <div className="text-white font-mono text-xs">{server.url}</div>
              </div>
              {type === "prometheus" ? (
                <div>
                  <div className="text-xs text-slate-400 mb-1">Query</div>
                  <div className="text-white font-mono text-xs truncate" title={server.query}>{server.query || "Not set"}</div>
                </div>
              ) : (
                <div>
                  <div className="text-xs text-slate-400 mb-1">Public URL</div>
                  <div className="text-white font-mono text-xs">{server.publicUrl || "Not set"}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-400">No {type} server configured</div>
          )}
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="ml-4 px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600 hover:border-cyan-500/50 text-slate-300 hover:text-white text-xs font-medium rounded transition-all whitespace-nowrap flex items-center"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
          <StyledInput
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={`My ${type.charAt(0).toUpperCase() + type.slice(1)} Server`}
            required
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Local URL</label>
          <StyledInput
            type="text"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            placeholder={type === "plex" ? "https://example.com:32400" : type === "jellyfin" ? "http://example.com:8096" : type === "tautulli" ? "http://example.com:8181" : type === "overseerr" ? "http://example.com:5055" : type === "sonarr" ? "http://example.com:8989" : type === "prometheus" ? "http://example.com:9090" : "http://example.com:7878"}
            required
            disabled={isPending}
          />
        </div>
        {type === "prometheus" ? (
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              PromQL Query <span className="text-slate-500 font-normal">(e.g. up{`{job="plex"}`})</span>
            </label>
            <StyledInput
              type="text"
              value={formData.query}
              onChange={(e) => setFormData({ ...formData, query: e.target.value })}
              placeholder='up{job="plex"}'
              required
              disabled={isPending}
            />
          </div>
        ) : (
          <>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Public URL <span className="text-slate-500 font-normal">(optional, e.g. https://{type}.example.com)</span>
              </label>
              <StyledInput
                type="text"
                value={formData.publicUrl}
                onChange={(e) => setFormData({ ...formData, publicUrl: e.target.value })}
                placeholder={`https://${type}.example.com`}
                disabled={isPending}
              />
            </div>
            {type === "plex" ? (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Plex Token</label>
                <StyledInput
                  type="password"
                  value={formData.token}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                  placeholder={hasStoredSecret ? "Leave blank to keep current token" : "Plex authentication token"}
                  required={!hasStoredSecret}
                  disabled={isPending}
                  autoComplete="off"
                />
              </div>
            ) : (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">API Key</label>
                <StyledInput
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={hasStoredSecret ? "Leave blank to keep current API key" : `${type.charAt(0).toUpperCase() + type.slice(1)} API key`}
                  required={!hasStoredSecret}
                  disabled={isPending}
                  autoComplete="off"
                />
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={isPending}
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
          <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsEditing(false)
            setFormData({
              name: server?.name || "",
              url: server?.url || "",
              publicUrl: server?.publicUrl || "",
              token: "",
              apiKey: "",
              query: server?.query || "",
            })
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
