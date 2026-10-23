"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"

import { claimServer } from "@/actions/setup-claim"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"

/**
 * "Claim this server" (ui-design-system 6.5, step 0; SEC-30): the setup code
 * from the server log, or `SETUP_TOKEN`, opens the wizard in this browser.
 * P10.25 rebuilds it as the wizard's first step.
 */
export function SetupClaimForm() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
    <Card className="mx-auto w-full max-w-[520px]" data-testid="setup-claim-form">
      <CardHeader>
        <h1 className="text-h2 text-foreground">Claim this server</h1>
        <CardDescription>
          Paste the setup code printed in the server log at startup, or the value of SETUP_TOKEN if you set one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField name="code" label="Setup code">
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
          <Button type="submit" loading={pending} loadingLabel="Claiming" data-testid="setup-claim-submit">
            Claim and continue
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
