import { render, screen } from "@testing-library/react"
import { StrictMode } from "react"

import { FlashFromQuery } from "@/components/ui/flash-from-query"
import { ToastProvider } from "@/components/ui/toast"

const navigation = { pathname: "/", search: "" }

jest.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}))

function renderAt(url: string) {
  const [pathname, search = ""] = url.split("?")
  navigation.pathname = pathname
  navigation.search = search
  window.history.replaceState(null, "", url)
  const replaceState = jest.spyOn(window.history, "replaceState")
  render(
    <StrictMode>
      <ToastProvider>
        <FlashFromQuery />
      </ToastProvider>
    </StrictMode>
  )
  return replaceState
}

describe("FlashFromQuery", () => {
  afterEach(() => jest.restoreAllMocks())

  it("shows a known code's toast once and drops only that param from the URL", async () => {
    const replaceState = renderAt("/discord/link?flash=discord_linked&tab=roles")

    expect(await screen.findByTestId("toast")).toHaveTextContent("Discord linked")
    expect(screen.getAllByTestId("toast")).toHaveLength(1)
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith(null, "", "/discord/link?tab=roles")
  })

  it("never renders query text, and strips the unknown error", async () => {
    const replaceState = renderAt("/?error=Your account is locked, call 555")

    expect(replaceState).toHaveBeenCalledWith(null, "", "/")
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent("555")
  })

  it("maps NextAuth's CredentialsSignin to its sign-in copy as an alert", async () => {
    renderAt("/?error=CredentialsSignin")

    const toast = await screen.findByTestId("toast")
    expect(toast).toHaveTextContent("Sign-in didn't work")
    expect(toast).toHaveAttribute("role", "alert")
  })

  it("shows the callback's legacy status=linked, but leaves other status filters alone", async () => {
    const replaceState = renderAt("/?status=linked")
    expect(await screen.findByTestId("toast")).toHaveTextContent("Discord linked")
    expect(replaceState).toHaveBeenCalledWith(null, "", "/")
  })

  it("does nothing on a page whose query carries no code", () => {
    const replaceState = renderAt("/admin/queues?status=failed")

    expect(replaceState).not.toHaveBeenCalled()
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument()
  })
})
