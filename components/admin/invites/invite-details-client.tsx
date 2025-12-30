"use client"

import { deleteInvite, getInviteDetails } from "@/actions/invite"
import { useToast } from "@/components/ui/sonner"
import { ConfirmModal } from "@/components/ui/alert-dialog"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

interface InviteDetails {
  id: string
  code: string
  maxUses: number
  useCount: number
  expiresAt: Date | null
  createdAt: Date
  allowDownloads: boolean
  librarySectionIds: string | null
  usages: {
    id: string
    usedAt: Date
    user: {
      id: string
      name: string | null
      email: string | null
      image: string | null
    }
  }[]
}

export function InviteDetailsClient({ id }: { id: string }) {
  const toast = useToast()
  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const router = useRouter()

  const loadInvite = useCallback(async () => {
    try {
      const result = await getInviteDetails(id)
      if (result.success && result.data) {
        // @ts-ignore - Prisma types might be slightly off in client
        setInvite(result.data)
      } else {
        router.push("/admin/invites")
      }
    } catch (error) {
      console.error("Failed to load invite details", error)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    loadInvite()
  }, [loadInvite])

  function handleDeleteClick() {
    setShowDeleteModal(true)
  }

  async function handleDeleteConfirm() {
    try {
      const result = await deleteInvite(id)
      if (result.success) {
        toast.showSuccess("Invite deleted successfully")
        router.push("/admin/invites")
      } else {
        toast.showError("Failed to delete invite")
      }
    } catch (error) {
      console.error("Failed to delete invite", error)
      toast.showError("Failed to delete invite")
    } finally {
      setShowDeleteModal(false)
    }
  }

  function getExpirationLabel(date: Date | null) {
    if (!date) return "Never"
    const now = new Date()
    if (date < now) return <span className="text-red-400">Expired</span>
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" role="img" aria-label="Loading">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    )
  }

  if (!invite) return null

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/invites"
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Back to invites"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Invite Details</h1>
          <p className="text-slate-400">View usage history and configuration</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={handleDeleteClick}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Invite
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Main Info Card */}
        <div className="md:col-span-2 bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Invite Code</h3>
              <div className="text-4xl font-mono font-bold text-white tracking-wider">{invite.code}</div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.code}`)
                toast.showSuccess("Copied to clipboard!")
              }}
              className="p-2 text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
              aria-label={`Copy invite link for ${invite.code}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Created</div>
              <div className="text-white font-medium">{new Date(invite.createdAt).toLocaleDateString()}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Expires</div>
              <div className="text-white font-medium">{getExpirationLabel(invite.expiresAt ? new Date(invite.expiresAt) : null)}</div>
            </div>
          </div>

          {/* Access Settings */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Access Settings</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Library Access</div>
                    <div className="text-white font-medium">
                      {invite.librarySectionIds
                        ? `${JSON.parse(invite.librarySectionIds).length} ${JSON.parse(invite.librarySectionIds).length === 1 ? 'library' : 'libraries'}`
                        : 'All libraries'}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Downloads</div>
                    <div className="text-white font-medium">
                      {invite.allowDownloads ? 'Allowed' : 'Not allowed'}
                    </div>
                  </div>
                  {invite.allowDownloads ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Stats Card */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 text-center">Usage</h3>
          <div className="relative w-32 h-32 mx-auto mb-4">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="60"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-slate-700"
              />
              <circle
                cx="64"
                cy="64"
                r="60"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={2 * Math.PI * 60}
                strokeDashoffset={2 * Math.PI * 60 * (1 - invite.useCount / invite.maxUses)}
                className={invite.useCount >= invite.maxUses ? "text-red-500" : "text-cyan-500"}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-3xl font-bold text-white">{invite.useCount}</span>
              <span className="text-sm text-slate-400">of {invite.maxUses}</span>
            </div>
          </div>
          <div className="text-center">
            {invite.useCount >= invite.maxUses ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                Fully Used
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Active
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h3 className="text-lg font-medium text-white">Usage History</h3>
        </div>

        {invite.usages.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No one has used this invite yet.
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-700">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {invite.usages.map((usage) => (
                <tr key={usage.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {usage.user.image ? (
                        <Image src={usage.user.image} alt={usage.user.name || ""} width={32} height={32} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                          {(usage.user.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-white">{usage.user.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {usage.user.email}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {new Date(usage.usedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
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
