"use client"

import {
  type AnnouncementData,
  createAnnouncement,
  deleteAnnouncement,
  getAllAnnouncements,
  setAnnouncementActive,
  updateAnnouncement,
} from "@/actions/announcements"
import { ConfirmModal } from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/sonner"
import { useCallback, useState } from "react"
import { AnnouncementFormModal, type AnnouncementFormData } from "./announcement-form-modal"
import { AnnouncementListItem } from "./announcement-list-item"

interface AnnouncementsPageClientProps {
  initialAnnouncements: AnnouncementData[]
}

const defaultFormData: AnnouncementFormData = {
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
  const [formData, setFormData] = useState<AnnouncementFormData>(defaultFormData)
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

  const handleSetActive = async (id: string, isActive: boolean) => {
    try {
      const result = await setAnnouncementActive(id, isActive)
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
        <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700" data-testid="announcements-empty-state">
          <svg className="w-12 h-12 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No announcements</h3>
          <p className="text-slate-400">Create your first announcement to display on the home page.</p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="announcements-list">
          {announcements.map((announcement) => (
            <AnnouncementListItem
              key={announcement.id}
              announcement={announcement}
              onToggleActive={handleSetActive}
              onEdit={openEditModal}
              onDelete={setDeleteId}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnnouncementFormModal
        isOpen={showCreateModal || editingAnnouncement !== null}
        isEditing={editingAnnouncement !== null}
        formData={formData}
        submitting={submitting}
        onFormChange={setFormData}
        onSubmit={editingAnnouncement ? handleUpdate : handleCreate}
        onClose={closeModal}
      />

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
