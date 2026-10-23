"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { chooseSetupPlexServer, pollSetupPlexConnect, startSetupPlexConnect } from "@/actions/setup-plex"
import { SetupServiceFields } from "@/components/setup/setup-wizard/service-connection-form"
import { isChoosable, PlexServerPicker } from "@/components/setup/setup-wizard/plex-server-picker"
import { SetupStepFrame } from "@/components/setup/setup-wizard/setup-step-frame"
import { useSetupServiceForm } from "@/components/setup/setup-wizard/use-setup-service-form"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Spinner } from "@/components/ui/spinner"
import type { StoredServer } from "@/hooks/admin/use-server-form"
import { icons } from "@/lib/ui/icons"
import { redirectTo } from "@/lib/utils/navigation"
import { nextStepId, type DevDefaults, type PickerServer } from "@/types/setup"

/** plex.tv is asked every 3 s, for up to 5 minutes. */
const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 100
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Connect =
  | { state: "start" }
  | { state: "waiting" }
  | { state: "expired" }
  | { state: "ready"; username: string; servers: PickerServer[] }

interface PlexConnectStepProps {
  /** Back from plex.tv: a Connect with Plex is under way in this browser. */
  pending: boolean
  stored: StoredServer | null
  devDefaults: DevDefaults
}

/**
 * Step 1, "Connect your Plex server" (design 6.5, UI-03): Connect with Plex
 * runs the PIN flow, then the owner picks one of their own servers and the
 * address to use. No token reaches the browser. "Enter a token instead"
 * keeps the URL and token form for a server that doesn't show up.
 */
export function PlexConnectStep({ pending, stored, devDefaults }: PlexConnectStepProps) {
  const router = useRouter()
  const tokenForm = useSetupServiceForm("plex", stored, devDefaults)
  const [connect, setConnect] = useState<Connect>(pending ? { state: "waiting" } : { state: "start" })
  const [tokenOpen, setTokenOpen] = useState(Boolean(stored) || Boolean(devDefaults.plex?.token))
  const [selected, setSelected] = useState<string | null>(null)
  const [uri, setUri] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uriError, setUriError] = useState<string | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  const [choosing, startChoose] = useTransition()
  const polled = useRef(false)

  // A real effect: after plex.tv sends the owner back, ask until the PIN is approved
  useEffect(() => {
    if (!pending || polled.current) return
    polled.current = true
    const run = async () => {
      for (let poll = 0; poll < MAX_POLLS; poll++) {
        const result = await pollSetupPlexConnect()
        if (!result.success) {
          setError(result.error)
          setConnect({ state: "start" })
          return
        }
        const data = result.data
        if (data.status === "ready") {
          const first = data.servers.find(isChoosable) ?? null
          setSelected(first?.machineIdentifier ?? null)
          setUri(first?.connections[0]?.uri ?? null)
          setConnect({ state: "ready", username: data.account.username, servers: data.servers })
          return
        }
        if (data.status !== "waiting") {
          setConnect(data.status === "expired" ? { state: "expired" } : { state: "start" })
          return
        }
        await wait(POLL_INTERVAL_MS)
      }
      setConnect({ state: "expired" })
    }
    void run()
  }, [pending])

  const start = async () => {
    setStarting(true)
    setError(null)
    const started = await startSetupPlexConnect()
    if (!started.success) {
      setError(started.error)
      setStarting(false)
      return
    }
    redirectTo(started.data.authUrl)
  }

  const select = (machineIdentifier: string) => {
    setSelected(machineIdentifier)
    const server = connect.state === "ready" ? connect.servers.find((item) => item.machineIdentifier === machineIdentifier) : undefined
    setUri(server?.connections[0]?.uri ?? null)
    setUriError(undefined)
  }

  const choose = () => {
    if (!selected || !uri) return
    startChoose(async () => {
      const result = await chooseSetupPlexServer({ machineIdentifier: selected, uri })
      if (result.success) {
        router.push(`/setup?step=${nextStepId("plex")}`)
        return
      }
      setUriError(result.fieldErrors?.uri?.[0])
      setError(result.fieldErrors?.uri ? null : result.error)
    })
  }

  const usingToken = tokenOpen && connect.state !== "ready"
  const busy = choosing || tokenForm.saving
  const canSave = usingToken ? !tokenForm.blockedReason : connect.state === "ready" && Boolean(selected && uri)

  return (
    <SetupStepFrame
      position="plex"
      heading="Connect your Plex server"
      description="Sign in with the Plex account that owns the server. Plex Manager lists your servers, so there's no token to look up."
      onSubmit={() => (usingToken ? tokenForm.submit() : choose())}
      busy={busy}
      primary={
        <Button type="submit" loading={busy} loadingLabel="Saving" disabled={!canSave || tokenForm.testing} data-testid="setup-form-submit">
          Save and continue
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {connect.state === "ready" ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-secondary p-3" data-testid="setup-plex-account">
              <p className="min-w-0 flex-1 text-ui font-medium text-foreground">Signed in to Plex as {connect.username}</p>
              <Button variant="ghost" size="sm" onClick={start} loading={starting} loadingLabel="Opening Plex" data-testid="setup-plex-restart">
                Use a different account
              </Button>
            </div>
            <PlexServerPicker
              servers={connect.servers}
              selected={selected}
              onSelect={select}
              uri={uri}
              onUriChange={(next) => {
                setUri(next)
                setUriError(undefined)
              }}
              uriError={uriError}
              disabled={choosing}
            />
          </>
        ) : connect.state === "waiting" ? (
          <p role="status" className="flex items-center gap-2 text-ui text-muted-foreground" data-testid="setup-plex-waiting">
            <Spinner size={16} />
            Waiting for plex.tv to confirm the sign-in
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {connect.state === "expired" && <Alert tone="warning" title="The Plex sign-in ran out">Connect with Plex again to list your servers.</Alert>}
            <Button size="lg" className="w-full sm:w-auto" icon={<Icon icon={icons.signIn} />} onClick={start} loading={starting} loadingLabel="Opening Plex" data-testid="setup-plex-connect">
              Connect with Plex
            </Button>
            <p className="max-w-[52ch] text-label text-muted-foreground">plex.tv opens. Approve Plex Manager there, and your servers appear here.</p>
          </div>
        )}
        {error && (
          <Alert tone="destructive" data-testid="setup-plex-error">
            {error}
          </Alert>
        )}
        {connect.state !== "ready" && (
          <details open={tokenOpen} onToggle={(event) => setTokenOpen(event.currentTarget.open)} className="group rounded-lg border" data-testid="setup-plex-token-disclosure">
            <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-ui font-medium text-foreground [&::-webkit-details-marker]:hidden">
              <Icon icon={icons.chevronRight} className="transition-transform group-open:rotate-90" />
              Enter a token instead
            </summary>
            <div className="flex flex-col gap-4 border-t px-3 py-4">
              <p className="text-label text-muted-foreground">For a server that doesn&apos;t show up, or if you can&apos;t sign in to plex.tv from this browser.</p>
              <SetupServiceFields kind="plex" form={tokenForm} stored={stored} />
            </div>
          </details>
        )}
      </div>
    </SetupStepFrame>
  )
}
