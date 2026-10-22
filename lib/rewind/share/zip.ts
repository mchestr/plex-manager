/**
 * "Save all cards" as one ZIP built in the browser (design 6.3, FR-24,
 * P8.4), on fflate's streaming `Zip`.
 *
 * Each card PNG is one `ZipPassThrough` entry: stored, not deflated, since a
 * PNG is already compressed. fflate's worker-based async API is not used, so
 * the CSP needs no `blob:` worker. fflate is loaded with `import()` on the
 * first Save all, outside the first-page budget.
 *
 * @module lib/rewind/share/zip
 */

export interface CardZip {
  /** Adds one stored entry. */
  add(name: string, bytes: Uint8Array): void
  /** Ends the archive and resolves with its bytes. */
  finish(): Promise<Uint8Array>
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/** A new streaming archive. */
export async function openCardZip(): Promise<CardZip> {
  const { Zip, ZipPassThrough } = await import("fflate")
  const chunks: Uint8Array[] = []
  let resolve: (bytes: Uint8Array) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const result = new Promise<Uint8Array>((res, rej) => {
    resolve = res
    reject = rej
  })
  const zip = new Zip((error, chunk, final) => {
    if (error) return reject(error)
    chunks.push(chunk)
    if (final) resolve(concat(chunks))
  })
  return {
    add(name, bytes) {
      const entry = new ZipPassThrough(name)
      zip.add(entry)
      entry.push(bytes, true)
    },
    finish() {
      zip.end()
      return result
    },
  }
}

/**
 * A card's entry name: its folio and page name.
 *
 * @example
 * ```ts
 * cardEntryName(2, "The number") // "02-the-number.png"
 * ```
 */
export function cardEntryName(folio: number, name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${String(folio).padStart(2, "0")}-${slug || "card"}.png`
}

/** The archive's file name. */
export const zipFileName = (year: number) => `rewind-${year}-cards.zip`
