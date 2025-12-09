"use client"

import { updateOverseerr, updatePlexServer, updatePrometheus, updateRadarr, updateSonarr, updateTautulli } from "@/actions/admin"
import { StyledInput } from "@/components/ui/styled-input"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

interface ServerFormProps {
  type: "plex" | "tautulli" | "overseerr" | "sonarr" | "radarr" | "prometheus"
  server: { name: string; url: string; token?: string; apiKey?: string; publicUrl?: string | null; query?: string } | null
}

export function ServerForm({ type, server }: ServerFormProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  const [formData, setFormData] = useState({
    name: server?.name || "",
    url: server?.url || "",
    publicUrl: server?.publicUrl || "",
    token: server?.token || "",
    apiKey: server?.apiKey || "",
    query: server?.query || "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    startTransition(async () => {
      let result
      if (type === "plex") {
        result = await updatePlexServer({
          name: formData.name,
          url: formData.url,
          token: formData.token!,
          publicUrl: formData.publicUrl || undefined,
        })
      } else if (type === "tautulli") {
        result = await updateTautulli({
          name: formData.name,
          url: formData.url,
          apiKey: formData.apiKey!,
          publicUrl: formData.publicUrl || undefined,
        })
      } else if (type === "overseerr") {
        result = await updateOverseerr({
          name: formData.name,
          url: formData.url,
          apiKey: formData.apiKey!,
          publicUrl: formData.publicUrl || undefined,
        })
      } else if (type === "sonarr") {
        result = await updateSonarr({
          name: formData.name,
          url: formData.url,
          apiKey: formData.apiKey!,
          publicUrl: formData.publicUrl || undefined,
        })
      } else if (type === "radarr") {
        result = await updateRadarr({
          name: formData.name,
          url: formData.url,
          apiKey: formData.apiKey!,
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
            placeholder={type === "plex" ? "https://example.com:32400" : type === "tautulli" ? "http://example.com:8181" : type === "overseerr" ? "http://example.com:5055" : type === "sonarr" ? "http://example.com:8989" : type === "prometheus" ? "http://example.com:9090" : "http://example.com:7878"}
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
                  placeholder="Plex authentication token"
                  required
                  disabled={isPending}
                />
              </div>
            ) : (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">API Key</label>
                <StyledInput
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={`${type.charAt(0).toUpperCase() + type.slice(1)} API key`}
                  required
                  disabled={isPending}
                />
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
          <button
          type="button"
          onClick={() => {
            setIsEditing(false)
            setFormData({
              name: server?.name || "",
              url: server?.url || "",
              publicUrl: server?.publicUrl || "",
              token: server?.token || "",
              apiKey: server?.apiKey || "",
              query: server?.query || "",
            })
          }}
          disabled={isPending}
          className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
