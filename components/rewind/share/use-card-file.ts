"use client"

import { useEffect, useState } from "react"

/**
 * The card PNG at `url` as a `File` named `name` (design 6.5 step 1),
 * fetched when the sheet opens and again whenever an option changes the URL.
 * Having the file before the tap is what keeps the tap's user activation for
 * `navigator.share` on iOS Safari. Null while it loads or when it failed.
 */
export function useCardFile(url: string | null, name: string): File | null {
  const [file, setFile] = useState<{ url: string; file: File } | null>(null)

  // A real effect: Web Share needs the card as a File before the tap, not after it
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    fetch(url, { signal: controller.signal, credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return
        const blob = await response.blob()
        setFile({ url, file: new File([blob], name, { type: "image/png" }) })
      })
      .catch(() => {
        // An aborted or failed fetch leaves no file: Save falls back to the URL.
      })
    return () => controller.abort()
  }, [url, name])

  return file && file.url === url ? file.file : null
}
