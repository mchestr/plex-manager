"use client"

import { StyledInput } from "@/components/ui/styled-input"

export interface AnnouncementFormData {
  title: string
  content: string
  priority: number
  isActive: boolean
  expiresAt: string
}

interface AnnouncementFormModalProps {
  isOpen: boolean
  isEditing: boolean
  formData: AnnouncementFormData
  submitting: boolean
  onFormChange: (data: AnnouncementFormData) => void
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}

export function AnnouncementFormModal({
  isOpen,
  isEditing,
  formData,
  submitting,
  onFormChange,
  onSubmit,
  onClose,
}: AnnouncementFormModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="presentation"
      onClick={onClose}
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
            {isEditing ? "Edit Announcement" : "New Announcement"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            data-testid="announcement-modal-close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={onSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-slate-300 mb-1">
              Title
            </label>
            <StyledInput
              id="title"
              name="title"
              value={formData.title}
              onChange={(e) => onFormChange({ ...formData, title: e.target.value })}
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
              onChange={(e) => onFormChange({ ...formData, content: e.target.value })}
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
                onChange={(e) => onFormChange({ ...formData, priority: parseInt(e.target.value) || 0 })}
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
                  onChange={(e) => onFormChange({ ...formData, isActive: e.target.checked })}
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
              onChange={(e) => onFormChange({ ...formData, expiresAt: e.target.value })}
              data-testid="announcement-expires-input"
            />
            <p className="text-xs text-slate-500 mt-1">Leave empty for no expiration</p>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
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
              {isEditing ? "Save Changes" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
