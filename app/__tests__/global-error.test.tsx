/**
 * @jest-environment node
 */

/**
 * app/global-error.tsx replaces the root layout, so it draws its own html and
 * body with inline styles from the token mirror (P10.17).
 */

import { renderToStaticMarkup } from "react-dom/server"

import GlobalError from "@/app/global-error"
import { themes } from "@/lib/design/tokens"

function markup(digest?: string) {
  const error = Object.assign(new Error("Can't reach database server at db:5432"), digest ? { digest } : {})
  return renderToStaticMarkup(<GlobalError error={error} reset={() => {}} />)
}

describe("app/global-error.tsx", () => {
  it("renders html and body", () => {
    const html = markup()

    expect(html).toMatch(/^<html lang="en" class="dark">(<head><\/head>)?<body /)
    expect(html).toMatch(/<\/body><\/html>$/)
  })

  it("sets the body background to the dark theme's background", () => {
    const html = markup()
    const bodyStyle = /<body style="([^"]*)"/.exec(html)?.[1] ?? ""

    expect(bodyStyle).toContain(`background:${themes.dark.background.hex}`)
  })

  it("uses no Tailwind classes below the html element", () => {
    expect(markup().replace(/^<html[^>]*>/, "")).not.toMatch(/class=/)
  })

  it("shows the digest and never the message", () => {
    const html = markup("abc123")

    expect(html).toContain("abc123")
    expect(html).toContain("Something went wrong on our side")
    expect(html).not.toContain("db:5432")
  })
})
