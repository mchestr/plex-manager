"use client"

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react"

/** A request to open a section for editing. */
export interface EditRequest {
  id: string
  /** A selector inside the section's form for the control to focus; the first field when left out. */
  focus?: string
  /** Grows with every request, so asking again focuses again. */
  n: number
}

interface SettingsEditContextValue {
  /** The sections open for editing: the one last opened, and any left with unsaved changes (Primer, "Saving"). */
  openIds: ReadonlySet<string>
  request: EditRequest | null
  requestEdit: (id: string, options?: { focus?: string }) => void
  endEdit: (id: string) => void
  reportDirty: (id: string, dirty: boolean) => void
}

const SettingsEditContext = createContext<SettingsEditContextValue | null>(null)

/**
 * The settings page's edit state: which sections are open for editing, and
 * each section's (or Sheet's) dirty flag for the section nav's "Unsaved
 * changes" pip. Opening a section closes the clean ones open before it; one
 * with unsaved changes stays open until it is saved or its changes are
 * discarded, even if they are typed away by hand, so nothing is ever thrown
 * away without asking.
 */
export function SettingsEditProvider({ onDirtyChange, children }: { onDirtyChange: (id: string, dirty: boolean) => void; children: ReactNode }) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set())
  const [request, setRequest] = useState<EditRequest | null>(null)
  const dirtyIds = useRef(new Set<string>())

  const reportDirty = useCallback(
    (id: string, dirty: boolean) => {
      if (dirty) dirtyIds.current.add(id)
      else dirtyIds.current.delete(id)
      onDirtyChange(id, dirty)
    },
    [onDirtyChange]
  )

  const requestEdit = useCallback((id: string, options?: { focus?: string }) => {
    setOpenIds(new Set([...dirtyIds.current, id]))
    setRequest((prev) => ({ id, focus: options?.focus, n: (prev?.n ?? 0) + 1 }))
  }, [])

  const endEdit = useCallback(
    (id: string) =>
      setOpenIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      }),
    []
  )

  const value = useMemo(() => ({ openIds, request, requestEdit, endEdit, reportDirty }), [openIds, request, requestEdit, endEdit, reportDirty])

  return <SettingsEditContext.Provider value={value}>{children}</SettingsEditContext.Provider>
}

/** Opens a section for editing from elsewhere on the page, such as Rewind's "Change the server time zone". Null outside the settings page. */
export function useSettingsEdit() {
  return useContext(SettingsEditContext)?.requestEdit ?? null
}

/** Reports a Sheet's unsaved changes to the page (the nav pip, the browser's leave prompt). Null outside the settings page. */
export function useReportDirty() {
  return useContext(SettingsEditContext)?.reportDirty ?? null
}

/** One section's mode: from the page's provider, or its own state when it stands alone. */
export function useSectionEditing(id: string) {
  const context = useContext(SettingsEditContext)
  const [local, setLocal] = useState<{ editing: boolean; request: EditRequest | null }>({ editing: false, request: null })

  if (context) {
    return {
      editing: context.openIds.has(id),
      request: context.request?.id === id ? context.request : null,
      requestEdit: (options?: { focus?: string }) => context.requestEdit(id, options),
      endEdit: () => context.endEdit(id),
      reportDirty: context.reportDirty,
    }
  }
  return {
    editing: local.editing,
    request: local.request,
    requestEdit: (options?: { focus?: string }) =>
      setLocal((prev) => ({ editing: true, request: { id, focus: options?.focus, n: (prev.request?.n ?? 0) + 1 } })),
    endEdit: () => setLocal((prev) => ({ ...prev, editing: false })),
    reportDirty: undefined,
  }
}
