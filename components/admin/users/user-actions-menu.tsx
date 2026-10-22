"use client"

import { CancelSubscriptionButton } from "@/components/admin/users/cancel-subscription-button"
import { GrantAccessButton } from "@/components/admin/users/grant-access-button"
import { RegenerateWrappedButton } from "@/components/admin/users/regenerate-wrapped-button"
import { ToggleExemptButton } from "@/components/admin/users/toggle-exempt-button"
import { UnshareUserButton } from "@/components/admin/users/unshare-user-button"
import { SubscriptionStatus } from "@/lib/generated/prisma/client"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { canRegenerate } from "@/lib/admin/can-regenerate"
import { userRewind } from "@/lib/admin/routes"

interface UserActionsMenuProps {
  user: {
    id: string
    name: string | null
    plexUserId: string | null
    isAdmin: boolean
    hasPlexAccess: boolean | null
    wrappedStatus: string | null
    wrappedRunStartedAt: Date | string | null
    subscriptionStatus: SubscriptionStatus | null
    isExempt: boolean
    stripeCustomerId: string | null
  }
  /** The season year whose Rewind status the row shows; View and Regenerate act on it. */
  year: number
  /** Stripe dashboard base URL (test/live aware), or null when unconfigured. */
  stripeDashboardBaseUrl?: string | null
}

export function UserActionsMenu({ user, year, stripeDashboardBaseUrl }: UserActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  // Read once per mount, so the render stays pure.
  const [now] = useState(() => Date.now())
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)

  // A subscription can only be canceled while it is actively billing.
  const canCancelSubscription =
    user.subscriptionStatus === "ACTIVE" || user.subscriptionStatus === "PAST_DUE"
  // Grant comp only makes sense for a non-admin that is not already exempt.
  const canGrantAccess = !user.isAdmin && !user.isExempt
  // Only link to Stripe when we have both a customer and a (mode-aware) base URL.
  const hasStripeLink = Boolean(user.stripeCustomerId && stripeDashboardBaseUrl)

  // A stuck run (over 15 minutes) can be retried from the list (UI-29).
  const regenerable = canRegenerate(
    { status: user.wrappedRunStartedAt ? "generating" : user.wrappedStatus, runStartedAt: user.wrappedRunStartedAt },
    now
  )

  const hasActions = regenerable ||
                     (!user.isAdmin && user.hasPlexAccess === true) ||
                     canCancelSubscription ||
                     canGrantAccess ||
                     !user.isAdmin ||
                     hasStripeLink

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
      <div className="text-xs text-muted-foreground">
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
        className="p-1.5 rounded-lg hover:bg-accent transition-colors group"
        aria-label={`Actions for ${user.name || 'user'}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <svg
          className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors"
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
              className="fixed w-48 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl z-50 overflow-hidden"
              style={{
                top: `${menuPosition.top}px`,
                right: `${menuPosition.right}px`,
              }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* View Rewind */}
          {user.wrappedStatus === "completed" && (
            <Link
              href={userRewind(user.id, year)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              <svg
                className="w-4 h-4 text-muted-foreground"
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
              View Rewind
            </Link>
          )}

          {/* Regenerate Wrapped */}
          {regenerable && (
            <div className="px-3 py-2 hover:bg-accent transition-colors">
              <RegenerateWrappedButton
                userId={user.id}
                plexUserId={user.plexUserId}
                year={year}
                inline={true}
                onSuccess={() => setIsOpen(false)}
              />
            </div>
          )}

          {/* Unshare Library */}
          {!user.isAdmin && user.hasPlexAccess === true && (
            <div className="px-3 py-2 hover:bg-accent transition-colors border-t border-border">
              <UnshareUserButton
                userId={user.id}
                userName={user.name}
                inline={true}
                onSuccess={() => setIsOpen(false)}
              />
            </div>
          )}

          {/* Cancel Subscription */}
          {canCancelSubscription && (
            <div className="px-3 py-2 hover:bg-accent transition-colors border-t border-border">
              <CancelSubscriptionButton
                userId={user.id}
                userName={user.name}
                onSuccess={() => setIsOpen(false)}
              />
            </div>
          )}

          {/* Grant Access (Comp) */}
          {canGrantAccess && (
            <div className="px-3 py-2 hover:bg-accent transition-colors border-t border-border">
              <GrantAccessButton
                userId={user.id}
                userName={user.name}
                onSuccess={() => setIsOpen(false)}
              />
            </div>
          )}

          {/* Toggle Exempt */}
          {!user.isAdmin && (
            <div className="px-3 py-2 hover:bg-accent transition-colors border-t border-border">
              <ToggleExemptButton
                userId={user.id}
                userName={user.name}
                isExempt={user.isExempt}
                onSuccess={() => setIsOpen(false)}
              />
            </div>
          )}

          {/* View in Stripe */}
          {hasStripeLink && (
            <a
              href={`${stripeDashboardBaseUrl}/customers/${user.stripeCustomerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors border-t border-border"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              data-testid="view-in-stripe-link"
            >
              <svg
                className="w-4 h-4 text-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              View in Stripe
            </a>
          )}
        </div>
          </>,
          document.body
      )}
    </>
  )
}
