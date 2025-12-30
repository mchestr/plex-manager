"use client"

import { createInvite, deleteInvite, getInvites } from "@/actions/invite"
import { getAvailableLibraries } from "@/actions/server-info"
import { getJellyfinLibraries } from "@/actions/admin/admin-servers"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/sonner"
import { ConfirmModal } from "@/components/ui/alert-dialog"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

type ServerType = "PLEX" | "JELLYFIN"

interface Invite {
  id: string
  code: string
  serverType: ServerType
  maxUses: number
  useCount: number
  expiresAt: Date | null
  createdAt: Date
  usages: {
    user: {
      name: string | null
      email: string | null
      image: string | null
    }
  }[]
}

interface JellyfinLibrary {
  id: string
  name: string
  type: string
}

export function InvitesPageClient() {
  const toast = useToast()
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [plexLibraries, setPlexLibraries] = useState<Array<{ id: number; title: string; type: string }>>([])
  const [jellyfinLibraries, setJellyfinLibraries] = useState<JellyfinLibrary[]>([])
  const [loadingLibraries, setLoadingLibraries] = useState(false)
  const [expandedLibraries, setExpandedLibraries] = useState(false)
  const [inviteIdToDelete, setInviteIdToDelete] = useState<string | null>(null)
  const [jellyfinAvailable, setJellyfinAvailable] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    code: "",
    serverType: "PLEX" as ServerType,
    maxUses: 1,
    expiresIn: "48h", // Default to 48 hours
    librarySectionIds: [] as number[],
    jellyfinLibraryIds: [] as string[],
    allowDownloads: false,
  })

  // Check if Jellyfin server is configured on mount
  useEffect(() => {
    async function checkJellyfinAvailability() {
      try {
        const result = await getJellyfinLibraries()
        // If we get a successful response or any data, Jellyfin is configured
        setJellyfinAvailable(result.success === true)
      } catch {
        setJellyfinAvailable(false)
      }
    }
    checkJellyfinAvailability()
  }, [])

  useEffect(() => {
    loadInvites()
  }, [])

  const loadPlexLibraries = useCallback(async () => {
    setLoadingLibraries(true)
    try {
      const result = await getAvailableLibraries()
      if (result.success && result.data) {
        setPlexLibraries(result.data)
      } else {
        console.error("[INVITES] Failed to load Plex libraries:", result.error)
        toast.showError(result.error || "Failed to load Plex libraries")
      }
    } catch (error) {
      console.error("[INVITES] Error loading Plex libraries:", error)
      toast.showError(error instanceof Error ? error.message : "Failed to load Plex libraries")
    } finally {
      setLoadingLibraries(false)
    }
  }, [])

  const loadJellyfinLibrariesFn = useCallback(async () => {
    setLoadingLibraries(true)
    try {
      const result = await getJellyfinLibraries()
      if (result.success && result.data) {
        setJellyfinLibraries(result.data)
      } else {
        console.error("[INVITES] Failed to load Jellyfin libraries:", result.error)
        // Don't show error for "no server configured" - just means Jellyfin isn't set up
        if (result.error && !result.error.includes("No active Jellyfin server")) {
          toast.showError(result.error || "Failed to load Jellyfin libraries")
        }
      }
    } catch (error) {
      console.error("[INVITES] Error loading Jellyfin libraries:", error)
      toast.showError(error instanceof Error ? error.message : "Failed to load Jellyfin libraries")
    } finally {
      setLoadingLibraries(false)
    }
  }, [])

  useEffect(() => {
    if (showCreateModal) {
      // Load libraries based on selected server type
      if (formData.serverType === "PLEX") {
        loadPlexLibraries()
      } else {
        loadJellyfinLibrariesFn()
      }
    }
  }, [showCreateModal, formData.serverType, loadPlexLibraries, loadJellyfinLibrariesFn])

  async function loadInvites() {
    try {
      const result = await getInvites()
      if (result.success && result.data) {
        // @ts-ignore - Prisma types might be slightly off in client
        setInvites(result.data)
      } else {
        toast.showError(result.error || "Failed to load invites")
      }
    } catch (error) {
      console.error("Failed to load invites", error)
      toast.showError(error instanceof Error ? error.message : "Failed to load invites")
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault()

    setCreating(true)
    try {
      const result = await createInvite({
        code: formData.code || undefined,
        serverType: formData.serverType,
        maxUses: Number(formData.maxUses),
        expiresIn: formData.expiresIn,
        // Plex-specific options
        librarySectionIds: formData.serverType === "PLEX" && formData.librarySectionIds.length > 0
          ? formData.librarySectionIds
          : undefined,
        allowDownloads: formData.allowDownloads,
        // Jellyfin-specific options
        jellyfinLibraryIds: formData.serverType === "JELLYFIN" && formData.jellyfinLibraryIds.length > 0
          ? formData.jellyfinLibraryIds
          : undefined,
      })

      if (result.success) {
        loadInvites()
        setShowCreateModal(false)
        setFormData({
          code: "",
          serverType: "PLEX",
          maxUses: 1,
          expiresIn: "48h",
          librarySectionIds: [],
          jellyfinLibraryIds: [],
          allowDownloads: false,
        })
        setExpandedLibraries(false)
        toast.showSuccess("Invite created successfully!")
      } else {
        toast.showError(result.error || "Failed to create invite")
      }
    } catch (error) {
      console.error("Failed to create invite", error)
      toast.showError(error instanceof Error ? error.message : "Failed to create invite")
    } finally {
      setCreating(false)
    }
  }

  function handleDeleteClick(id: string) {
    setInviteIdToDelete(id)
  }

  async function handleDeleteConfirm() {
    if (!inviteIdToDelete) return

    try {
      const result = await deleteInvite(inviteIdToDelete)
      if (result.success) {
        loadInvites()
        toast.showSuccess("Invite deleted successfully")
      } else {
        toast.showError("Failed to delete invite")
      }
    } catch (error) {
      console.error("Failed to delete invite", error)
      toast.showError("Failed to delete invite")
    } finally {
      setInviteIdToDelete(null)
    }
  }

  function copyInviteLink(code: string) {
    const link = `${window.location.origin}/invite/${code}`
    navigator.clipboard.writeText(link)
    toast.showSuccess("Invite link copied to clipboard!")
  }

  function getExpirationLabel(date: Date | null) {
    if (!date) return "Never"
    const now = new Date()
    if (date < now) return <span className="text-red-400">Expired</span>
    return date.toLocaleDateString()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Invites</h1>
          <p className="text-slate-400">Manage invites to your media servers</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          data-testid="generate-invite-button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Generate Invite
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" role="img" aria-label="Loading">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : invites.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700">
          <svg className="w-12 h-12 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No invites yet</h3>
          <p className="text-slate-400">Generate an invite code to get started.</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-700">
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Code</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Server</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usage</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Expires</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Created</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {invites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <Link
                        href={`/admin/invites/${invite.id}`}
                        className="font-mono text-base sm:text-lg text-white tracking-wider hover:text-cyan-400 transition-colors break-all"
                      >
                        {invite.code}
                      </Link>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        invite.serverType === "JELLYFIN"
                          ? "bg-purple-500/20 text-purple-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}>
                        {invite.serverType === "JELLYFIN" ? "Jellyfin" : "Plex"}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-[80px]">
                        <div className="w-full sm:w-[120px] bg-slate-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              invite.useCount >= invite.maxUses ? 'bg-red-500' : 'bg-cyan-700'
                            }`}
                            style={{ width: `${Math.min(100, (invite.useCount / invite.maxUses) * 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs sm:text-sm text-slate-400 whitespace-nowrap">
                          {invite.useCount} / {invite.maxUses}
                        </span>
                      </div>
                      {/* Show expires on mobile as part of usage cell */}
                      <div className="text-xs text-slate-500 mt-1 sm:hidden">
                        {getExpirationLabel(invite.expiresAt ? new Date(invite.expiresAt) : null)}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-400 hidden sm:table-cell">
                      {getExpirationLabel(invite.expiresAt ? new Date(invite.expiresAt) : null)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-slate-400 hidden md:table-cell">
                      {new Date(invite.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyInviteLink(invite.code)}
                          aria-label={`Copy invite link for ${invite.code}`}
                        >
                          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(invite.id)}
                          className="hover:text-red-400"
                          aria-label={`Delete invite ${invite.code}`}
                        >
                          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Invite Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="presentation"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-invite-title"
            aria-describedby="create-invite-description"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h2 id="create-invite-title" className="text-xl font-bold text-white">Create Invite</h2>
                <p id="create-invite-description" className="text-sm text-slate-400 mt-1">Generate a new invite link to share with others</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
            <form onSubmit={handleCreateInvite} className="p-6 space-y-4">
              {/* Server Type Selection - only show if Jellyfin is available */}
              {jellyfinAvailable && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Server Type
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      data-testid="invite-server-type-plex"
                      onClick={() => setFormData({
                        ...formData,
                        serverType: "PLEX",
                        jellyfinLibraryIds: [] // Clear Jellyfin selections
                      })}
                      className={`flex-1 px-4 py-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                        formData.serverType === "PLEX"
                          ? "bg-amber-500/20 border-amber-500 text-amber-300"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.643 0L4.68 12l6.963 12h2.714L7.394 12l6.963-12z" />
                        <path d="M12.357 0l6.963 12-6.963 12h2.714L22 12 15.071 0z" />
                      </svg>
                      Plex
                    </button>
                    <button
                      type="button"
                      data-testid="invite-server-type-jellyfin"
                      onClick={() => setFormData({
                        ...formData,
                        serverType: "JELLYFIN",
                        librarySectionIds: [], // Clear Plex selections
                        allowDownloads: false
                      })}
                      className={`flex-1 px-4 py-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                        formData.serverType === "JELLYFIN"
                          ? "bg-purple-500/20 border-purple-500 text-purple-300"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 .002C7.524.002 3.256 2.063 1.664 5.227c-.43.856-.665 1.79-.665 2.73v8.085c0 3.983 4.925 7.956 11 7.956s11-3.973 11-7.956V7.957c0-.94-.234-1.874-.665-2.73C20.744 2.063 16.476.002 12 .002zm0 2.002c3.605 0 6.904 1.523 8.336 3.898.333.552.498 1.175.498 1.798v8.342c0 2.794-3.986 5.956-8.834 5.956S3.166 18.836 3.166 16.042V7.7c0-.623.165-1.246.498-1.798C5.096 3.527 8.395 2.004 12 2.004z" />
                      </svg>
                      Jellyfin
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="invite-code" className="block text-sm font-medium text-slate-400 mb-1">
                  Custom Code <span className="text-slate-400">(Optional)</span>
                </label>
                <input
                  id="invite-code"
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                  placeholder="Leave blank to auto-generate"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Auto-generated codes use unambiguous characters (no 0, O, I, 1).
                </p>
              </div>

              <div>
                <label htmlFor="max-uses" className="block text-sm font-medium text-slate-400 mb-1">
                  Max Uses
                </label>
                <input
                  id="max-uses"
                  type="number"
                  min="1"
                  value={formData.maxUses}
                  onChange={(e) => setFormData({ ...formData, maxUses: parseInt(e.target.value) || 1 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label htmlFor="expiration" className="block text-sm font-medium text-slate-400 mb-1">
                  Expiration
                </label>
                <select
                  id="expiration"
                  value={formData.expiresIn}
                  onChange={(e) => setFormData({ ...formData, expiresIn: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="1d">24 Hours</option>
                  <option value="48h">48 Hours</option>
                  <option value="7d">7 Days</option>
                  <option value="30d">30 Days</option>
                  <option value="never">Never</option>
                </select>
              </div>

              {/* Library Selection */}
              <div className="border-t border-slate-700 pt-4">
                <button
                  type="button"
                  onClick={() => setExpandedLibraries(!expandedLibraries)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <label className="block text-sm font-medium text-slate-400">
                    Library Access
                  </label>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${expandedLibraries ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedLibraries && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-slate-400 mb-2">
                      {formData.serverType === "PLEX"
                        ? "Select specific libraries to share (leave empty to share all libraries)"
                        : "Select specific libraries to grant access (leave empty for all libraries)"
                      }
                    </p>
                    {loadingLibraries ? (
                      <p className="text-sm text-slate-400">Loading libraries...</p>
                    ) : formData.serverType === "PLEX" ? (
                      // Plex libraries
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {plexLibraries.length === 0 ? (
                          <p className="text-sm text-slate-500">No Plex libraries available</p>
                        ) : (
                          plexLibraries.map((lib) => (
                            <label key={lib.id} className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData.librarySectionIds.includes(lib.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      librarySectionIds: [...formData.librarySectionIds, lib.id],
                                    })
                                  } else {
                                    setFormData({
                                      ...formData,
                                      librarySectionIds: formData.librarySectionIds.filter((id) => id !== lib.id),
                                    })
                                  }
                                }}
                                className="rounded border-slate-600 text-cyan-600 focus:ring-cyan-500"
                              />
                              <span className="text-sm text-slate-300">
                                {lib.title} <span className="text-slate-400">({lib.type})</span>
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    ) : (
                      // Jellyfin libraries
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {jellyfinLibraries.length === 0 ? (
                          <p className="text-sm text-slate-500">No Jellyfin libraries available</p>
                        ) : (
                          jellyfinLibraries.map((lib) => (
                            <label key={lib.id} className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData.jellyfinLibraryIds.includes(lib.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      jellyfinLibraryIds: [...formData.jellyfinLibraryIds, lib.id],
                                    })
                                  } else {
                                    setFormData({
                                      ...formData,
                                      jellyfinLibraryIds: formData.jellyfinLibraryIds.filter((id) => id !== lib.id),
                                    })
                                  }
                                }}
                                className="rounded border-slate-600 text-purple-600 focus:ring-purple-500"
                              />
                              <span className="text-sm text-slate-300">
                                {lib.name} <span className="text-slate-400">({lib.type})</span>
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Allow Downloads */}
              <div className="border-t border-slate-700 pt-4">
                <label htmlFor="allow-downloads" className="flex items-center space-x-2 cursor-pointer">
                  <input
                    id="allow-downloads"
                    type="checkbox"
                    checked={formData.allowDownloads}
                    onChange={(e) => setFormData({ ...formData, allowDownloads: e.target.checked })}
                    className={`rounded border-slate-600 focus:ring-offset-slate-900 ${
                      formData.serverType === "JELLYFIN"
                        ? "text-purple-600 focus:ring-purple-500"
                        : "text-cyan-600 focus:ring-cyan-500"
                    }`}
                  />
                  <span className="text-sm font-medium text-slate-400">
                    Allow Downloads
                  </span>
                </label>
                <p className="text-xs text-slate-400 mt-1 ml-6">
                  Allow this account to download content from your server
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  aria-busy={creating}
                  data-testid="create-invite-submit"
                  className="flex-1"
                >
                  {creating ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating...
                    </>
                  ) : (
                    "Create Invite"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={inviteIdToDelete !== null}
        onClose={() => setInviteIdToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Invite"
        message="Are you sure you want to delete this invite? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  )
}
