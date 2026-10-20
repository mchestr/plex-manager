/**
 * Renders one `next/og` image outside Jest, which cannot load `@vercel/og`
 * (an ES module behind a dynamic import). Reads `{ element, width, height,
 * fonts }` as JSON on stdin, with each font's data in base64, replaces
 * `fetch` with a recorder that always fails, and prints
 * `{ png, bytes, fetches }`.
 */

const { ImageResponse } = require("next/og")

const fetches = []
const realFetch = globalThis.fetch
// `@vercel/og` loads its own WebAssembly through `data:` URLs, which never leave the process.
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.startsWith("data:")) return realFetch(input, init)
  fetches.push(url)
  throw new Error("network disabled")
}

let raw = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => (raw += chunk))
process.stdin.on("end", async () => {
  const { element, width, height, fonts } = JSON.parse(raw)
  const decoded = fonts.map((font) => {
    const bytes = Buffer.from(font.data, "base64")
    return { ...font, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  })
  const response = new ImageResponse(element, { width, height, fonts: decoded })
  const png = Buffer.from(await response.arrayBuffer())
  process.stdout.write(
    JSON.stringify({ png: png.subarray(1, 4).toString("latin1"), bytes: png.length, fetches }),
  )
})
