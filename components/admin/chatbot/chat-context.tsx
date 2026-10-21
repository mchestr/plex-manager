"use client"

import { usePathname } from "next/navigation"
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"

import { isAssistantHidden } from "@/lib/admin/nav"

interface ChatContextType {
  isOpen: boolean
  setOpen: (open: boolean) => void
  /** Opens or closes the sheet, and remembers `trigger` so focus returns to it on close. */
  toggleFrom: (trigger: HTMLElement) => void
  /** The trigger that last opened the sheet, for its `finalFocus`. */
  returnFocus: RefObject<HTMLElement | null>
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

/**
 * The assistant sheet's open state, shared by its triggers in the sidebar and
 * the mobile top bar. It closes on navigation to a route that hides it.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin"
  const [isOpen, setOpen] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)

  if (isOpen && isAssistantHidden(pathname)) setOpen(false)

  const toggleFrom = useCallback((trigger: HTMLElement) => {
    returnFocus.current = trigger
    setOpen((open) => !open)
  }, [])

  const value = useMemo(() => ({ isOpen, setOpen, toggleFrom, returnFocus }), [isOpen, toggleFrom])

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider")
  }
  return context
}
