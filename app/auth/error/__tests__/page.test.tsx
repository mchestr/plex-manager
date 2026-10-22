/**
 * NextAuth's error page (P10.27, UI-07, SEC-20): known codes get their copy,
 * anything else the Default copy, and the query text never reaches the DOM.
 */

import { render, screen } from "@testing-library/react"

import AuthErrorPage from "@/app/auth/error/page"

async function renderWith(error?: string | string[]) {
  const { container } = render(await AuthErrorPage({ searchParams: Promise.resolve(error === undefined ? {} : { error }) }))
  return container
}

describe("/auth/error", () => {
  it.each([
    ["Configuration", "Sign-in isn't working"],
    ["AccessDenied", "You don't have access"],
    ["Verification", "That sign-in expired"],
    ["RateLimited", "Too many attempts"],
  ])("shows the copy for %s as a StatusScreen", async (code, title) => {
    await renderWith(code)

    expect(screen.getByTestId("status-screen")).toBeInTheDocument()
    expect(screen.getByTestId("auth-error-heading")).toHaveTextContent(title)
    expect(screen.getByTestId("status-screen-code")).toHaveTextContent(code)
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/")
  })

  it.each([
    ["an unknown code", "SomethingNew"],
    ["a script", "<script>alert(1)</script>"],
    ["a message", "Your account is locked, call 555-0100"],
  ])("shows the Default copy for %s and never the text", async (_label, error) => {
    const container = await renderWith(error)

    expect(screen.getByTestId("status-screen-code")).toHaveTextContent("Default")
    expect(container.innerHTML).not.toContain(error.replace(/</g, "&lt;"))
    expect(container.textContent).not.toContain(error)
    expect(container.querySelector("script")).toBeNull()
  })

  it("treats a missing or repeated error as Default", async () => {
    await renderWith(["AccessDenied", "Configuration"])
    expect(screen.getByTestId("status-screen-code")).toHaveTextContent("Default")
  })
})
