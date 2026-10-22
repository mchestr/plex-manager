"use client"

import { useState } from "react"

import { processJellyfinInvite } from "@/actions/invite"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { icons } from "@/lib/ui/icons"
import { safeHref } from "@/lib/ui/markdown"
import { jellyfinInviteCredentialsSchema } from "@/lib/validations/jellyfin"

const REDEEM_FAILED = "Your account could not be created. Please try again."

interface JellyfinSignInFormProps {
  inviteCode: string
  /** The Jellyfin server's name: "Creates an account on {serverName}". */
  serverName: string
  "data-testid"?: string
}

/**
 * The invite pass's Jellyfin account form: a username and a password, checked
 * here with the action's own schema, then `processJellyfinInvite`. Every
 * failure, the server's included, shows on the form, which stays usable.
 */
export function JellyfinSignInForm({ inviteCode, serverName, "data-testid": testId }: JellyfinSignInFormProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ jellyfinUrl: string | null } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const credentials = jellyfinInviteCredentialsSchema.safeParse({ username, password })
    if (!credentials.success) {
      setFormError(credentials.error.issues[0].message)
      return
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match")
      return
    }

    setFormError(null)
    setIsSubmitting(true)
    try {
      const result = await processJellyfinInvite({ code: inviteCode, credentials: credentials.data })
      if (result.success) {
        setCreated({ jellyfinUrl: safeHref(result.data.serverUrl) })
      } else {
        setFormError(result.error)
      }
    } catch {
      setFormError(REDEEM_FAILED)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (created) {
    return (
      <div className="flex flex-col items-start gap-3" data-testid={testId} role="status">
        <span className="flex size-10 items-center justify-center rounded-lg border bg-success-subtle text-success">
          <Icon icon={icons.success} size={20} />
        </span>
        <h2 className="text-h3 text-foreground" data-testid="jellyfin-success-heading">
          Your account is ready
        </h2>
        <p className="text-body text-muted-foreground">Sign in to {serverName} with the username and password you chose.</p>
        {created.jellyfinUrl && (
          <Button
            size="lg"
            nativeButton={false}
            render={<a href={created.jellyfinUrl} target="_blank" rel="noopener noreferrer" />}
            data-testid="jellyfin-open-link"
          >
            Open Jellyfin
            <Icon icon={icons.externalLink} />
          </Button>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4" data-testid={testId} noValidate>
      <p className="text-caption text-muted-foreground">Creates an account on {serverName}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="jellyfin-invite-username">Username</Label>
        <Input
          id="jellyfin-invite-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Choose a username"
          disabled={isSubmitting}
          autoComplete="username"
          aria-describedby="jellyfin-username-hint"
          data-testid="jellyfin-username-input"
        />
        <p id="jellyfin-username-hint" className="text-caption text-muted-foreground">
          3 to 32 letters, numbers, dots, dashes or underscores
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="jellyfin-invite-password">Password</Label>
        <Input
          id="jellyfin-invite-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Create a password"
          disabled={isSubmitting}
          autoComplete="new-password"
          data-testid="jellyfin-password-input"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="jellyfin-invite-confirm-password">Confirm password</Label>
        <Input
          id="jellyfin-invite-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm your password"
          disabled={isSubmitting}
          autoComplete="new-password"
          data-testid="jellyfin-confirm-password-input"
        />
      </div>

      {formError && (
        <Alert tone="destructive" data-testid="jellyfin-form-error">
          {formError}
        </Alert>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        icon={<Icon icon={icons.jellyfin} />}
        loading={isSubmitting}
        loadingLabel="Creating account"
        data-testid="jellyfin-submit-button"
      >
        Create account
      </Button>
    </form>
  )
}
