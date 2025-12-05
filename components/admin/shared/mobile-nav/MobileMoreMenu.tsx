"use client"

import Link from "next/link"
import { useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { type NavItem } from "./MobileNavButton"

type MobileMoreMenuProps = {
  isOpen: boolean
  onClose: () => void
  menuItems: NavItem[]
  isActive: (href: string) => boolean
  onSignOut: () => void
  moreButtonRef: React.RefObject<HTMLButtonElement | null>
}

export function MobileMoreMenu({
  isOpen,
  onClose,
  menuItems,
  isActive,
  onSignOut,
  moreButtonRef,
}: MobileMoreMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const menuItemRefs = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([])
  const focusedIndexRef = useRef<number>(-1)

  // Total focusable items: menu items + Home + Sign Out
  const totalItems = menuItems.length + 2

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return

      switch (event.key) {
        case "Escape":
          event.preventDefault()
          onClose()
          // Return focus to More button
          moreButtonRef.current?.focus()
          break

        case "ArrowDown":
          event.preventDefault()
          focusedIndexRef.current = (focusedIndexRef.current + 1) % totalItems
          menuItemRefs.current[focusedIndexRef.current]?.focus()
          break

        case "ArrowUp":
          event.preventDefault()
          focusedIndexRef.current =
            focusedIndexRef.current <= 0 ? totalItems - 1 : focusedIndexRef.current - 1
          menuItemRefs.current[focusedIndexRef.current]?.focus()
          break

        case "Tab":
          // Allow natural tab behavior but wrap within menu
          if (!event.shiftKey && focusedIndexRef.current === totalItems - 1) {
            event.preventDefault()
            focusedIndexRef.current = 0
            menuItemRefs.current[0]?.focus()
          } else if (event.shiftKey && focusedIndexRef.current === 0) {
            event.preventDefault()
            focusedIndexRef.current = totalItems - 1
            menuItemRefs.current[totalItems - 1]?.focus()
          }
          break

        case "Home":
          event.preventDefault()
          focusedIndexRef.current = 0
          menuItemRefs.current[0]?.focus()
          break

        case "End":
          event.preventDefault()
          focusedIndexRef.current = totalItems - 1
          menuItemRefs.current[totalItems - 1]?.focus()
          break
      }
    },
    [isOpen, onClose, moreButtonRef, totalItems]
  )

  // Add/remove keyboard listeners
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown)
      // Focus first item when menu opens
      focusedIndexRef.current = 0
      // Small delay to ensure element is mounted and animation has started
      timeoutId = setTimeout(() => {
        menuItemRefs.current[0]?.focus()
      }, 0)
    } else {
      focusedIndexRef.current = -1
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [isOpen, handleKeyDown])

  // Track focus within menu for Tab key handling
  useEffect(() => {
    if (!isOpen) return

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      const index = menuItemRefs.current.findIndex((ref) => ref === target)
      if (index !== -1) {
        focusedIndexRef.current = index
      }
    }

    const menu = menuRef.current
    menu?.addEventListener("focusin", handleFocus)

    return () => {
      menu?.removeEventListener("focusin", handleFocus)
    }
  }, [isOpen])

  // Set ref for menu items
  const setMenuItemRef = (index: number) => (el: HTMLAnchorElement | HTMLButtonElement | null) => {
    menuItemRefs.current[index] = el
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onClose}
            aria-hidden="true"
            data-testid="mobile-more-menu-backdrop"
          />

          {/* Menu panel */}
          <motion.div
            ref={menuRef}
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 300,
              opacity: { duration: 0.2 }
            }}
            id="mobile-more-menu"
            role="menu"
            aria-label="Additional navigation options"
            className="absolute bottom-full left-0 right-0 bg-slate-900/98 backdrop-blur-sm border-t border-slate-700 max-h-[60vh] overflow-y-auto z-50"
          >
            <div className="p-4 grid grid-cols-3 gap-2">
              {menuItems.map((item, index) => (
                <Link
                  key={item.href}
                  ref={setMenuItemRef(index) as React.Ref<HTMLAnchorElement>}
                  href={item.href}
                  role="menuitem"
                  tabIndex={0}
                  data-testid={`${item.testId}-mobile`}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                    isActive(item.href)
                      ? "bg-gradient-to-r from-cyan-600/20 to-purple-600/20 border border-cyan-500/30 text-cyan-400"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  <div
                    className={`transition-colors ${isActive(item.href) ? "text-cyan-400" : "text-slate-500"}`}
                  >
                    {item.icon}
                  </div>
                  <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                </Link>
              ))}
              {/* Home */}
              <Link
                ref={setMenuItemRef(menuItems.length) as React.Ref<HTMLAnchorElement>}
                href="/"
                role="menuitem"
                tabIndex={0}
                data-testid="admin-nav-home-mobile"
                className="flex flex-col items-center gap-2 p-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                <svg
                  className="w-5 h-5 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                <span className="text-xs font-medium text-center leading-tight">Home</span>
              </Link>
              {/* Sign Out */}
              <button
                ref={setMenuItemRef(menuItems.length + 1) as React.Ref<HTMLButtonElement>}
                onClick={onSignOut}
                role="menuitem"
                tabIndex={0}
                data-testid="admin-nav-signout-mobile"
                className="flex flex-col items-center gap-2 p-3 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                <svg
                  className="w-5 h-5 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span className="text-xs font-medium text-center leading-tight">Sign Out</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
