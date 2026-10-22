"use client"

import { useActionState } from "react"

import { redeemJellyfinInviteForm } from "@/actions/invite"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { idleFormState } from "@/lib/actions/form-state"
import { icons } from "@/lib/ui/icons"
import { safeHref } from "@/lib/ui/markdown"

const REDEEM_FAILED = "Your account could not be created. Please try again."
const ERROR_ID = "jellyfin-invite-error"

type RedeemState = Awaited<ReturnType<typeof redeemJellyfinInviteForm>>

interface JellyfinSignInFormProps {
  inviteCode: string
  /** The Jellyfin server's name: "Creates an account on {serverName}". */
  serverName: string
  "data-testid"?: string
}

/**
 * Redeems `inviteCode` through the form action. A request that never reaches
 * the server shows fixed copy, never its text.
 */
async function redeem(inviteCode: string, previous: RedeemState, form: FormData): Promise<RedeemState> {
  form.set("code", inviteCode)
  try {
    return await redeemJellyfinInviteForm(previous, form)
  } catch {
    return { ...previous, status: "error", data: null, error: REDEEM_FAILED, fieldErrors: {}, values: { username: String(form.get("username") ?? "") } }
  }
}

/**
 * The invite pass's Jellyfin account form: a `<form action>` with
 * `useActionState` (P10.7) on `redeemJellyfinInviteForm`, which checks the
 * username, the password and its confirmation before `processJellyfinInvite`.
 * Every failure shows on the form, which stays usable; the username is
 * re-seeded after an error, the passwords are not.
 */
export function JellyfinSignInForm({ inviteCode, serverName, "data-testid": testId }: JellyfinSignInFormProps) {
  const [state, formAction] = useActionState(
    (previous: RedeemState, form: FormData) => redeem(inviteCode, previous, form),
    idleFormState<NonNullable<RedeemState["data"]>>()
  )
  const invalid = (field: string) => Boolean(state.fieldErrors[field]?.length) || undefined
  const describedBy = (field: string, hint?: string) =>
    [hint, invalid(field) ? ERROR_ID : undefined].filter(Boolean).join(" ") || undefined

  if (state.status === "success" && state.data) {
    const jellyfinUrl = safeHref(state.data.serverUrl)
    return (
      <div className="flex flex-col items-start gap-3" data-testid={testId} role="status">
        <span className="flex size-10 items-center justify-center rounded-lg border bg-success-subtle text-success">
          <Icon icon={icons.success} size={20} />
        </span>
        <h2 className="text-h3 text-foreground" data-testid="jellyfin-success-heading">
          Your account is ready
        </h2>
        <p className="text-body text-muted-foreground">Sign in to {serverName} with the username and password you chose.</p>
        {jellyfinUrl && (
          <Button
            size="lg"
            nativeButton={false}
            render={<a href={jellyfinUrl} target="_blank" rel="noopener noreferrer" />}
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
    <form action={formAction} className="flex w-full flex-col gap-4" data-testid={testId} noValidate>
      <p className="text-caption text-muted-foreground">Creates an account on {serverName}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="jellyfin-invite-username">Username</Label>
        <Input
          id="jellyfin-invite-username"
          name="username"
          type="text"
          defaultValue={state.values.username ?? ""}
          placeholder="Choose a username"
          autoComplete="username"
          aria-invalid={invalid("username")}
          aria-describedby={describedBy("username", "jellyfin-username-hint")}
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
          name="password"
          type="password"
          placeholder="Create a password"
          autoComplete="new-password"
          aria-invalid={invalid("password")}
          aria-describedby={describedBy("password")}
          data-testid="jellyfin-password-input"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="jellyfin-invite-confirm-password">Confirm password</Label>
        <Input
          id="jellyfin-invite-confirm-password"
          name="confirmPassword"
          type="password"
          placeholder="Confirm your password"
          autoComplete="new-password"
          aria-invalid={invalid("confirmPassword")}
          aria-describedby={describedBy("confirmPassword")}
          data-testid="jellyfin-confirm-password-input"
        />
      </div>

      {state.error && (
        <Alert id={ERROR_ID} tone="destructive" data-testid="jellyfin-form-error">
          {state.error}
        </Alert>
      )}

      <SubmitButton
        size="lg"
        className="w-full"
        icon={<Icon icon={icons.jellyfin} />}
        loadingLabel="Creating account"
        data-testid="jellyfin-submit-button"
      >
        Create account
      </SubmitButton>
    </form>
  )
}
