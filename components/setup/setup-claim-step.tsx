"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react"

import { claimServer } from "@/actions/setup-claim"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FormField } from "@/components/ui/form-field"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { icons } from "@/lib/ui/icons"

const NEXT = [
  { text: "Connect your Plex server by signing in with Plex.", note: "Required" },
  { text: "Connect Tautulli for watch history.", note: "Required" },
  { text: "Requests, automation, AI, Discord and monitoring.", note: "Each can wait" },
]

/**
 * Step 0, "Claim this server" (design 6.5, SEC-30): the setup code from the
 * server log, or `SETUP_TOKEN`, opens the wizard in this browser. A key tile,
 * the mono code field, "Claim and continue", and what happens next.
 */
export function SetupClaimStep() {
  const router = useRouter()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // A real effect: the claim is the page's one task, so its heading takes focus
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await claimServer({ code })
      if (!result.success) {
        setError(result.error)
        return
      }
      setError(null)
      // The page renders the wizard once the claim cookie is set
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
      <p className="text-label text-muted-foreground">Before step 1</p>
      <Card data-testid="setup-claim-form">
        <CardContent className="flex flex-col gap-5 py-5">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-md border bg-secondary text-muted-foreground">
            <Icon icon={icons.reenterSecret} size={20} />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 ref={headingRef} tabIndex={-1} className="text-h2 text-foreground outline-none">
              Claim this server
            </h1>
            <p className="text-ui text-muted-foreground">
              This proves you&apos;re the owner before anything is connected. Paste the setup code printed in the server log at startup, or the
              value of <span className="font-mono">SETUP_TOKEN</span> if you set one.
            </p>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
            <FormField
              name="code"
              label="Setup code"
              description={
                <>
                  Find it with <span className="font-mono">docker logs plex-manager</span>. It works once and expires when setup finishes.
                </>
              }
            >
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="K7QM-4WZD-P2HX"
                required
                className="font-mono"
                data-testid="setup-claim-code-input"
              />
            </FormField>
            {error && (
              <Alert tone="destructive" data-testid="setup-claim-error">
                {error}
              </Alert>
            )}
            <Button type="submit" size="lg" className="w-full" loading={pending} loadingLabel="Claiming" data-testid="setup-claim-submit">
              Claim and continue
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <h2 className="text-h3 text-foreground">What happens next</h2>
          <ol className="flex flex-col gap-2.5">
            {NEXT.map((item, index) => (
              <li key={item.text} className="flex items-start gap-3 text-ui text-foreground">
                <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full border text-caption text-muted-foreground">
                  {index + 1}
                </span>
                <span>
                  {item.text} <span className="text-muted-foreground">{item.note}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
