"use client"

import { RegenerateWrappedButton } from "@/components/admin/users/regenerate-wrapped-button"
import { UnshareUserButton } from "@/components/admin/users/unshare-user-button"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface UserActionsMenuProps {
  user: {
    id: string
    name: string | null
    isAdmin: boolean
    hasPlexAccess: boolean | null
    wrappedStatus: string | null
  }
}

export function UserActionsMenu({ user }: UserActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)

  const hasActions = user.wrappedStatus === "completed" ||
                     user.wrappedStatus === "failed" ||
                     !user.wrappedStatus ||
                     (!user.isAdmin && user.hasPlexAccess === true)

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 4, // 4px gap (mt-1)
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen])

  if (!hasActions) {
    return (
      <div className="text-xs text-slate-500">
        {user.wrappedStatus === "generating" ? "Generating..." : "No actions"}
      </div>
    )
  }

  return (
    <>
      {/* Menu Button */}
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors group"
        aria-label={`Actions for ${user.name || 'user'}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <svg
          className="w-5 h-5 text-slate-400 group-hover:text-slate-200 transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {/* Dropdown Menu - rendered via portal to escape table overflow */}
      {isOpen &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop - closes menu when clicking outside */}
        <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div
              role="menu"
              aria-label={`Actions for ${user.name || 'user'}`}
              className="fixed w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden"
              style={{
                top: `${menuPosition.top}px`,
                right: `${menuPosition.right}px`,
              }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* View Wrapped */}
          {user.wrappedStatus === "completed" && (
            <Link
              href={`/admin/users/${user.id}/wrapped`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700/50 transition-colors"
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              <svg
                className="w-4 h-4 text-cyan-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              View Wrapped
            </Link>
          )}

          {/* Regenerate Wrapped */}
          {(user.wrappedStatus === "completed" ||
            user.wrappedStatus === "failed" ||
            !user.wrappedStatus) && (
            <div className="px-3 py-2 hover:bg-slate-700/50 transition-colors">
              <RegenerateWrappedButton
                userId={user.id}
                inline={true}
                onSuccess={() => setIsOpen(false)}
              />
            </div>
          )}

          {/* Unshare Library */}
          {!user.isAdmin && user.hasPlexAccess === true && (
            <div className="px-3 py-2 hover:bg-slate-700/50 transition-colors border-t border-slate-700">
              <UnshareUserButton
                userId={user.id}
                userName={user.name}
                inline={true}
                onSuccess={() => setIsOpen(false)}
              />
            </div>
          )}
        </div>
          </>,
          document.body
      )}
    </>
  )
}
