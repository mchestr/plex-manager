"use client"

import type { AnnouncementData } from "@/actions/announcements"
import { Button } from "@/components/ui/button"

interface AnnouncementListItemProps {
  announcement: AnnouncementData
  onToggleActive: (id: string, isActive: boolean) => void
  onEdit: (announcement: AnnouncementData) => void
  onDelete: (id: string) => void
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

export function AnnouncementListItem({
  announcement,
  onToggleActive,
  onEdit,
  onDelete,
}: AnnouncementListItemProps) {
  return (
    <div
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleActive(announcement.id, !announcement.isActive)}
            title={announcement.isActive ? "Deactivate" : "Activate"}
            aria-label={announcement.isActive ? "Deactivate announcement" : "Activate announcement"}
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
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(announcement)}
            title="Edit"
            aria-label="Edit announcement"
            data-testid={`edit-announcement-${announcement.id}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(announcement.id)}
            title="Delete"
            aria-label="Delete announcement"
            data-testid={`delete-announcement-${announcement.id}`}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  )
}
