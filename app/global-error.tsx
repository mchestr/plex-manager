"use client"

import { useEffect, type CSSProperties } from "react"

import { themes } from "@/lib/design/tokens"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("error-boundary")

const dark = themes.dark

const styles = {
  body: {
    margin: 0,
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 16px",
    background: dark.background.hex,
    color: dark.foreground.hex,
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
  },
  block: { maxWidth: 440, width: "100%", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 8,
    border: `1px solid ${dark.border.hex}`,
    background: dark.muted.hex,
    color: dark["muted-foreground"].hex,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 600,
  },
  code: { margin: 0, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: dark["muted-foreground"].hex },
  title: { margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 600, letterSpacing: "-0.015em" },
  text: { margin: 0, fontSize: 15, lineHeight: "24px", color: dark["muted-foreground"].hex },
  actions: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 8 },
  primary: {
    height: 44,
    padding: "0 20px",
    borderRadius: 6,
    border: "1px solid transparent",
    background: dark.primary.hex,
    color: dark["primary-foreground"].hex,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondary: {
    height: 44,
    padding: "0 20px",
    borderRadius: 6,
    border: `1px solid ${dark["border-strong"].hex}`,
    background: dark.secondary.hex,
    color: dark["secondary-foreground"].hex,
    fontSize: 15,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
  },
} satisfies Record<string, CSSProperties>

/**
 * The last-resort boundary, for an error in the root layout itself
 * (ui-design-system 6.7). It replaces the root layout, so it draws its own
 * `<html>` and `<body>` with inline styles from the token mirror: no
 * Tailwind, no providers, no components that need them. Only the digest is
 * shown, never the message (SEC-20).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("Global error", error, { digest: error.digest })
  }, [error])

  return (
    <html lang="en" className="dark">
      <body style={styles.body}>
        <main id="main" style={styles.block} data-testid="status-screen">
          <span aria-hidden="true" style={styles.tile}>
            !
          </span>
          {error.digest && (
            <p style={styles.code} data-testid="status-screen-code">
              {error.digest}
            </p>
          )}
          <h1 style={styles.title}>Something went wrong on our side</h1>
          <p style={styles.text}>Please try again. If it keeps happening, let the server admin know.</p>
          <div style={styles.actions}>
            {/* The root layout failed, so the app's CSS and primitives may not have loaded: inline styles only. */}
            {/* eslint-disable-next-line no-restricted-syntax */}
            <button type="button" onClick={reset} style={styles.primary} data-testid="error-retry">
              Try again
            </button>
            {/* A full page load: the root layout is what failed, so client navigation can't be trusted. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={styles.secondary} data-testid="error-home">
              Go to home
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
