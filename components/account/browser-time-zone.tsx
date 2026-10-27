"use client"

import { useEffect } from "react"

import { adoptBrowserTimezone } from "@/actions/account"

/**
 * Saves the browser's zone for a member who has none saved (Rewind 7.7), so
 * their Rewind reads their own clock rather than the server's. The member
 * layout renders it only while `User.timezone` is null; a zone the settings
 * cannot store leaves the member on the server zone.
 */
export function BrowserTimeZone() {
  useEffect(() => {
    void adoptBrowserTimezone({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  }, [])
  return null
}
