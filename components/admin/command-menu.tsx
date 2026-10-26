"use client"

import { useAdminNav } from "@/components/shell/admin-nav-context"
import type { LucideIcon } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Icon } from "@/components/ui/icon"
import { useAdminSearch } from "@/hooks/admin/use-admin-search"
import { useIsClient } from "@/hooks/use-is-client"
import { ADMIN_SEARCH_MAX, type AdminSearchResult } from "@/lib/admin/search"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

interface QuickAction {
  id: string
  label: string
  href: Route
  icon: LucideIcon
}

/** The pages open their dialog from the param (P10.16); Generate all keeps its confirm on the Season page. */
const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: "create-invite", label: "Create invite", href: "/admin/invites?create=1", icon: icons.invites },
  { id: "new-announcement", label: "New announcement", href: "/admin/announcements?new=1", icon: icons.announcements },
  { id: "generate-all-rewinds", label: "Generate all Rewinds", href: "/admin/rewind", icon: icons.rewind },
]

interface CommandMenuContextValue {
  open: boolean
  /** Opens the menu; focus returns to `trigger` when it closes. */
  openFrom: (trigger: HTMLElement | null) => void
}

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null)

function useCommandMenu(): CommandMenuContextValue {
  const context = useContext(CommandMenuContext)
  if (!context) throw new Error("useCommandMenu must be used within a CommandMenuProvider")
  return context
}

function isToggleKey(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
}

/**
 * The admin command menu (P10.16, ui-design-system 6.2): Ctrl or Cmd K, the
 * sidebar's "Search or jump to" and the mobile search button open it. The
 * admin shell mounts it once around its chrome.
 */
export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)

  const change = useCallback((next: boolean) => {
    openRef.current = next
    setOpen(next)
  }, [])

  const openFrom = useCallback(
    (trigger: HTMLElement | null) => {
      returnFocus.current = trigger
      change(true)
    },
    [change]
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isToggleKey(event)) return
      event.preventDefault()
      if (openRef.current) {
        change(false)
        return
      }
      const active = document.activeElement
      openFrom(active instanceof HTMLElement && active !== document.body ? active : null)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [change, openFrom])

  const value = useMemo(() => ({ open, openFrom }), [open, openFrom])

  return (
    <CommandMenuContext.Provider value={value}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={change}
        finalFocus={returnFocus}
        title="Search or jump to"
        description="Find a page, a member or an invite code, or start a quick action."
        data-testid="admin-command-menu"
      >
        <CommandMenuBody onDone={() => change(false)} />
      </CommandDialog>
    </CommandMenuContext.Provider>
  )
}

/** A button that opens the menu, such as the sidebar's `admin-command-trigger`. */
export function CommandMenuTrigger({ onClick, ...props }: ComponentProps<typeof Button>) {
  const { open, openFrom } = useCommandMenu()
  return (
    <Button
      variant="ghost"
      aria-haspopup="dialog"
      aria-expanded={open}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        openFrom(event.currentTarget)
      }}
    />
  )
}

/** "Ctrl K", or "⌘ K" on a Mac once the browser says so. Shown only to fine pointers. */
export function CommandMenuKeyHint({ className }: { className?: string }) {
  const isClient = useIsClient()
  const mac = isClient && /mac|iphone|ipad/i.test(navigator.userAgent)
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        "hidden h-5 items-center rounded-sm border border-border-strong bg-background px-1 font-mono text-caption text-muted-foreground pointer-fine:inline-flex",
        className
      )}
    >
      {mac ? "⌘ K" : "Ctrl K"}
    </kbd>
  )
}

function matches(term: string, ...texts: Array<string | null>): boolean {
  return texts.some((text) => text?.toLowerCase().includes(term))
}

function ResultItem({ kind, result, icon, onSelect }: { kind: string; result: AdminSearchResult; icon: LucideIcon; onSelect: (href: Route) => void }) {
  return (
    <CommandItem
      value={`${kind}:${result.id}`}
      onSelect={() => onSelect(result.href as Route)}
      data-testid={`admin-command-${kind}-${result.id}`}
    >
      <Icon icon={icon} />
      <span className="truncate">{result.label}</span>
      <CommandShortcut>{result.sub}</CommandShortcut>
    </CommandItem>
  )
}

/**
 * The menu's content, mounted while it is open so each opening starts
 * empty. Destinations and quick actions filter here, because the root's
 * `shouldFilter={false}` leaves the server's results as they come.
 */
function CommandMenuBody({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const { items, scoped } = useAdminNav()
  const users = useAdminSearch("users", search, !scoped)
  const invites = useAdminSearch("invites", search, !scoped)

  const term = search.trim().toLowerCase()
  const searching = term.length > 0
  const destinations = items.filter((item) => matches(term, item.label, item.group))
  const actions = scoped ? [] : QUICK_ACTIONS.filter((action) => matches(term, action.label))
  const settled = users.q === search.trim().slice(0, ADMIN_SEARCH_MAX) && !users.isFetching && !invites.isFetching

  const go = (href: Route) => {
    onDone()
    router.push(href)
  }

  return (
    <Command label="Search or jump to" shouldFilter={false} vimBindings={false} loop>
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search members, invite codes and pages"
        maxLength={ADMIN_SEARCH_MAX}
        data-testid="admin-command-input"
      />
      <CommandList>
        <CommandEmpty>{searching && !settled ? "Searching" : "No matches"}</CommandEmpty>
        {destinations.length > 0 && (
          <CommandGroup heading="Go to">
            {destinations.map((item) => (
              <CommandItem key={item.id} value={`page:${item.id}`} onSelect={() => go(item.href)} data-testid={`admin-command-page-${item.id}`}>
                <Icon icon={item.icon} />
                <span className="truncate">{item.label}</span>
                {item.group && <CommandShortcut>{item.group}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {searching && users.results.length > 0 && (
          <CommandGroup heading="Members">
            {users.results.map((result) => (
              <ResultItem key={result.id} kind="user" result={result} icon={icons.users} onSelect={go} />
            ))}
          </CommandGroup>
        )}
        {searching && invites.results.length > 0 && (
          <CommandGroup heading="Invites">
            {invites.results.map((result) => (
              <ResultItem key={result.id} kind="invite" result={result} icon={icons.invites} onSelect={go} />
            ))}
          </CommandGroup>
        )}
        {actions.length > 0 && (
          <CommandGroup heading="Quick actions">
            {actions.map((action) => (
              <CommandItem key={action.id} value={`action:${action.id}`} onSelect={() => go(action.href)} data-testid={`admin-command-action-${action.id}`}>
                <Icon icon={action.icon} />
                <span className="truncate">{action.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}
