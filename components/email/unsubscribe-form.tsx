"use client"

import Link from "next/link"
import { useState, useTransition, type FormEvent } from "react"

import { unsubscribeWithToken } from "@/actions/email-unsubscribe"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import type { ActionResult } from "@/lib/actions/result"
import { icons } from "@/lib/ui/icons"

/** A changed, expired or old link, or one for a removed member: how to choose the emails instead. */
export function UnsubscribeDeadLink({ serverName }: { serverName: string }) {
  return (
    <StatusScreen
      icon={icons.warning}
      title="This link no longer works"
      titleTestId="unsubscribe-dead-link"
      description={`Sign in to ${serverName} and open Account to choose your emails.`}
      primaryAction={
        <Button size="lg" nativeButton={false} render={<Link href="/" />} data-testid="unsubscribe-sign-in">
          Sign in
        </Button>
      }
    />
  )
}

interface UnsubscribeFormProps {
  /** The token from the link, which the page has checked. */
  token: string
  serverName: string
}

/**
 * The question, the "Stop these emails" button and a link to Account,
 * where a signed-in member can choose their emails.
 *
 * With JavaScript the button calls `unsubscribeWithToken`, and the result
 * replaces the question: Done, or the dead-link screen for a removed
 * member; any other failure (the rate limit) shows above the button.
 *
 * Without JavaScript (a member whose network blocks the app's scripts) the
 * form is a plain HTML form: the button posts `List-Unsubscribe=One-Click`
 * to the one-click address with `source=page`, so the audit row says the
 * link, and the address answers with a short text that names the server.
 */
export function UnsubscribeForm({ token, serverName }: UnsubscribeFormProps) {
  const [result, setResult] = useState<ActionResult<null> | null>(null)
  const [pending, startTransition] = useTransition()

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => setResult(await unsubscribeWithToken({ token })))
  }

  if (result?.success) {
    return (
      <StatusScreen
        icon={icons.success}
        title="Done"
        titleTestId="unsubscribe-done"
        description={`We will not send you these emails. To turn them on again, sign in to ${serverName} and open Account.`}
        primaryAction={null}
      />
    )
  }

  if (result?.code === "NOT_FOUND") return <UnsubscribeDeadLink serverName={serverName} />

  return (
    <form
      method="post"
      action={`/api/email/unsubscribe?token=${encodeURIComponent(token)}&source=page`}
      onSubmit={onSubmit}
      className="flex w-full flex-col items-center gap-4"
      data-testid="unsubscribe-form"
    >
      {result && (
        <Alert tone="destructive" data-testid="unsubscribe-error">
          {result.error}
        </Alert>
      )}
      <StatusScreen
        icon={icons.email}
        title={`Stop emails about your ${serverName} access?`}
        titleTestId="unsubscribe-question"
        description="These emails tell you before your access ends because you have not watched anything for a while."
        primaryAction={
          <Button
            type="submit"
            name="List-Unsubscribe"
            value="One-Click"
            size="lg"
            loading={pending}
            loadingLabel="Saving"
            data-testid="unsubscribe-submit"
          >
            Stop these emails
          </Button>
        }
        secondaryAction={
          <Button variant="secondary" size="lg" nativeButton={false} render={<Link href="/account" />} data-testid="unsubscribe-account">
            Open Account
          </Button>
        }
      />
    </form>
  )
}
