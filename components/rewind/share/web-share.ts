/**
 * The Web Share API and its fallbacks for a card PNG (design 6.5).
 *
 * @module components/rewind/share/web-share
 */

/** iPhone and iPad Safari, which save an image from a new tab by press and hold. */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

/** Whether this browser can share an image file: desktop Firefox and most desktops cannot. */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], "probe.png", { type: "image/png" })] })
  } catch {
    return false
  }
}

/**
 * Shares `file` through the system sheet with the files only. A dismissed
 * sheet (`AbortError`) is `aborted` and stays silent; anything else is
 * `failed`, and the caller falls back to Save.
 */
export async function shareFile(file: File, title: string): Promise<"shared" | "aborted" | "failed"> {
  if (!navigator.canShare?.({ files: [file] })) return "failed"
  try {
    await navigator.share({ files: [file], title })
    return "shared"
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "aborted" : "failed"
  }
}

/**
 * Saves the card: a download through `<a download>` with an object URL, or,
 * on iOS without file sharing, the PNG in a new tab to press and hold.
 */
export function saveFile(file: File | null, url: string, name: string): "downloaded" | "opened" {
  if (isIOS() && !canShareFiles()) {
    window.open(url, "_blank", "noopener")
    return "opened"
  }
  const href = file ? URL.createObjectURL(file) : url
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  if (file) setTimeout(() => URL.revokeObjectURL(href), 1000)
  return "downloaded"
}
