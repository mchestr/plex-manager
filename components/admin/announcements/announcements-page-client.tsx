"use client"

import {
  type AnnouncementData,
  createAnnouncement,
  deleteAnnouncement,
  getAllAnnouncements,
  toggleAnnouncementActive,
  updateAnnouncement,
} from "@/actions/announcements"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { StyledInput } from "@/components/ui/styled-input"
import { useToast } from "@/components/ui/toast"
import { useCallback, useState } from "react"

interface AnnouncementsPageClientProps {
  initialAnnouncements: AnnouncementData[]
}

interface FormData {
  title: string
  content: string
  priority: number
  isActive: boolean
  expiresAt: string
}

const defaultFormData: FormData = {
  title: "",
  content: "",
  priority: 0,
  isActive: true,
  expiresAt: "",
}

export function AnnouncementsPageClient({ initialAnnouncements }: AnnouncementsPageClientProps) {
  const toast = useToast()
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>(initialAnnouncements)
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementData | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(defaultFormData)
  const [submitting, setSubmitting] = useState(false)

  const loadAnnouncements = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllAnnouncements()
      setAnnouncements(data)
    } catch {
      toast.showError("Failed to load announcements")
    } finally {
      setLoading(false)
    }
  }, [toast])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const result = await createAnnouncement({
        ...formData,
        expiresAt: formData.expiresAt || null,
      })
      if (result.success) {
        toast.showSuccess("Announcement created")
        setShowCreateModal(false)
        setFormData(defaultFormData)
        loadAnnouncements()
      } else {
        toast.showError(result.error || "Failed to create announcement")
      }
    } catch {
      toast.showError("Failed to create announcement")
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAnnouncement) return
    setSubmitting(true)
    try {
      const result = await updateAnnouncement({
        id: editingAnnouncement.id,
        ...formData,
        expiresAt: formData.expiresAt || null,
      })
      if (result.success) {
        toast.showSuccess("Announcement updated")
        setEditingAnnouncement(null)
        setFormData(defaultFormData)
        loadAnnouncements()
      } else {
        toast.showError(result.error || "Failed to update announcement")
      }
    } catch {
      toast.showError("Failed to update announcement")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const result = await deleteAnnouncement(deleteId)
      if (result.success) {
        toast.showSuccess("Announcement deleted")
        loadAnnouncements()
      } else {
        toast.showError(result.error || "Failed to delete announcement")
      }
    } catch {
      toast.showError("Failed to delete announcement")
    } finally {
      setDeleteId(null)
    }
  }

  const handleToggleActive = async (id: string) => {
    try {
      const result = await toggleAnnouncementActive(id)
      if (result.success) {
        toast.showSuccess("Announcement status updated")
        loadAnnouncements()
      } else {
        toast.showError(result.error || "Failed to update status")
      }
    } catch {
      toast.showError("Failed to update status")
    }
  }

  const openEditModal = (announcement: AnnouncementData) => {
    setEditingAnnouncement(announcement)
    setFormData({
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority,
      isActive: announcement.isActive,
      expiresAt: announcement.expiresAt
        ? new Date(announcement.expiresAt).toISOString().slice(0, 16)
        : "",
    })
  }

  const closeModal = () => {
    setShowCreateModal(false)
    setEditingAnnouncement(null)
    setFormData(defaultFormData)
  }

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Announcements</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage announcements displayed on the home page
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors"
          data-testid="create-announcement-button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Announcement
        </button>
      </div>

      {/* Announcements List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-cyan-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700">
          <svg className="w-12 h-12 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No announcements</h3>
          <p className="text-slate-400">Create your first announcement to display on the home page.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 sm:p-6"
              data-testid={`announcement-${announcement.id}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-white">{announcement.title}</h3>
                    {/* Status badge */}
                    {!announcement.isActive ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-600 text-slate-300">
                        Inactive
                      </span>
                    ) : isExpired(announcement.expiresAt) ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                        Expired
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                        Active
                      </span>
                    )}
                    {/* Priority badge */}
                    {announcement.priority > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">
                        Priority: {announcement.priority}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-slate-300 text-sm whitespace-pre-wrap line-clamp-3">
                    {announcement.content}
                  </p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                    <span>Created: {new Date(announcement.createdAt).toLocaleDateString()}</span>
                    {announcement.expiresAt && (
                      <span>Expires: {new Date(announcement.expiresAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(announcement.id)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title={announcement.isActive ? "Deactivate" : "Activate"}
                    data-testid={`toggle-announcement-${announcement.id}`}
                  >
                    {announcement.isActive ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => openEditModal(announcement)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="Edit"
                    data-testid={`edit-announcement-${announcement.id}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteId(announcement.id)}
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                    title="Delete"
                    data-testid={`delete-announcement-${announcement.id}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingAnnouncement) && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 id="modal-title" className="text-lg font-semibold text-white">
                {editingAnnouncement ? "Edit Announcement" : "New Announcement"}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={editingAnnouncement ? handleUpdate : handleCreate} className="p-4 space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-slate-300 mb-1">
                  Title
                </label>
                <StyledInput
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Announcement title"
                  required
                  data-testid="announcement-title-input"
                />
              </div>

              {/* Content */}
              <div>
                <label htmlFor="content" className="block text-sm font-medium text-slate-300 mb-1">
                  Content (Markdown supported)
                </label>
                <textarea
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Announcement content... You can use **bold**, *italic*, and [links](url)"
                  required
                  rows={5}
                  className="w-full bg-slate-800/50 border border-slate-600 hover:border-slate-500 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-cyan-400 focus:ring-1 transition-colors resize-none"
                  data-testid="announcement-content-input"
                />
              </div>

              {/* Priority and Active Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-slate-300 mb-1">
                    Priority
                  </label>
                  <StyledInput
                    id="priority"
                    name="priority"
                    type="number"
                    min={0}
                    max={100}
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    data-testid="announcement-priority-input"
                  />
                  <p className="text-xs text-slate-500 mt-1">Higher = shown first</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
                  <label className="flex items-center gap-2 cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                      data-testid="announcement-active-checkbox"
                    />
                    <span className="text-sm text-slate-300">Active</span>
                  </label>
                </div>
              </div>

              {/* Expiration Date */}
              <div>
                <label htmlFor="expiresAt" className="block text-sm font-medium text-slate-300 mb-1">
                  Expiration Date (Optional)
                </label>
                <StyledInput
                  id="expiresAt"
                  name="expiresAt"
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  data-testid="announcement-expires-input"
                />
                <p className="text-xs text-slate-500 mt-1">Leave empty for no expiration</p>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  data-testid="announcement-submit-button"
                >
                  {submitting && (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {editingAnnouncement ? "Save Changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Announcement"
        message="Are you sure you want to delete this announcement? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </>
  )
}
