"use client"

import { useState } from "react"

import {
  approveAffiliate,
  refuseAffiliate,
  revokeAffiliateStatus,
  setAffiliateOverride,
  unblockAffiliateAccount,
} from "@/actions/admin/affiliates"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useActionDialog } from "@/hooks/use-action-dialog"
import { MAX_AFFILIATE_INVITES } from "@/lib/affiliates/tiers"
import { AFFILIATE_REASON_MAX } from "@/lib/validations/affiliates"

interface Target {
  id: string
  name: string
}

function ReasonField({ value, onChange, testId }: { value: string; onChange: (value: string) => void; testId: string }) {
  return (
    <FormField name={testId} label="Reason" optional description="The member sees this reason.">
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={AFFILIATE_REASON_MAX} rows={3} data-testid={testId} />
    </FormField>
  )
}

const approve = (applicationId: string) => approveAffiliate({ applicationId })

export function ApproveDialog({ application }: { application: Target }) {
  const { run } = useActionDialog(approve, { success: `${application.name} is an affiliate` })
  return (
    <ConfirmDialog
      trigger={<Button size="sm" data-testid={`admin-affiliates-approve-${application.id}`}>Approve</Button>}
      title={`Approve ${application.name}?`}
      description="We check their access and watch hours again first. They can make invites while the switch is on."
      confirmLabel="Approve"
      pendingLabel="Approving"
      action={() => run(application.id)}
      data-testid="admin-affiliates-approve-dialog"
      confirmTestId="admin-affiliates-approve-confirm"
    />
  )
}

const refuse = (applicationId: string, reason: string) => refuseAffiliate({ applicationId, reason })

export function RefuseDialog({ application }: { application: Target }) {
  const [reason, setReason] = useState("")
  const { run } = useActionDialog(refuse, { success: "Application refused" })
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline" data-testid={`admin-affiliates-refuse-${application.id}`}>
          Refuse
        </Button>
      }
      title={`Refuse ${application.name}?`}
      description="They can apply again after 30 days."
      confirmLabel="Refuse"
      pendingLabel="Refusing"
      tone="destructive"
      action={() => run(application.id, reason)}
      onOpenChange={(open) => !open && setReason("")}
      data-testid="admin-affiliates-refuse-dialog"
      confirmTestId="admin-affiliates-refuse-confirm"
    >
      <ReasonField value={reason} onChange={setReason} testId="admin-affiliates-refuse-reason" />
    </ConfirmDialog>
  )
}

const revoke = (applicationId: string, reason: string) => revokeAffiliateStatus({ applicationId, reason })

export function RevokeDialog({ affiliate }: { affiliate: Target }) {
  const [reason, setReason] = useState("")
  const { run } = useActionDialog(revoke, { success: "Affiliate status revoked" })
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="destructive" data-testid={`admin-affiliates-revoke-${affiliate.id}`}>
          Revoke
        </Button>
      }
      title={`Revoke ${affiliate.name}'s affiliate status?`}
      description="Their open invites stop working now. The people they invited stay members. They can apply again after 30 days."
      confirmLabel="Revoke"
      pendingLabel="Revoking"
      tone="destructive"
      action={() => run(affiliate.id, reason)}
      onOpenChange={(open) => !open && setReason("")}
      data-testid="admin-affiliates-revoke-dialog"
      confirmTestId="admin-affiliates-revoke-confirm"
    >
      <ReasonField value={reason} onChange={setReason} testId="admin-affiliates-revoke-reason" />
    </ConfirmDialog>
  )
}

const OVERRIDE_PATTERN = /^(?:\d|10)$/

const saveOverride = (applicationId: string, override: number | null) => setAffiliateOverride({ applicationId, override })

export function OverrideDialog({ affiliate, current }: { affiliate: Target; current: number | null }) {
  const [value, setValue] = useState(current === null ? "" : String(current))
  const { run } = useActionDialog(saveOverride, { success: "Invites changed" })
  const trimmed = value.trim()
  const valid = trimmed === "" || OVERRIDE_PATTERN.test(trimmed)
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline" data-testid={`admin-affiliates-override-${affiliate.id}`}>
          Set invites
        </Button>
      }
      title={`Set ${affiliate.name}'s invites`}
      description={`Invites per 30 days, from 0 to ${MAX_AFFILIATE_INVITES}, in place of their tier. 0 pauses them. Leave it empty to use the tiers.`}
      confirmLabel="Save"
      pendingLabel="Saving"
      action={() => (valid ? run(affiliate.id, trimmed === "" ? null : Number(trimmed)) : Promise.resolve({ error: "Enter a number from 0 to 10." }))}
      onOpenChange={(open) => open && setValue(current === null ? "" : String(current))}
      data-testid="admin-affiliates-override-dialog"
      confirmTestId="admin-affiliates-override-confirm"
    >
      <FormField name="admin-affiliates-override-input" label="Invites per 30 days" optional error={valid ? undefined : "Enter a number from 0 to 10."}>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_AFFILIATE_INVITES}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          data-testid="admin-affiliates-override-input"
        />
      </FormField>
      {current !== null && (
        <Button variant="link" className="w-fit" onClick={() => setValue("")} data-testid="admin-affiliates-override-clear">
          Use the tiers
        </Button>
      )}
    </ConfirmDialog>
  )
}

const unblock = (blockId: string) => unblockAffiliateAccount({ blockId })

export function UnblockDialog({ blockId }: { blockId: string }) {
  const { run } = useActionDialog(unblock, { success: "Account unblocked" })
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline" data-testid={`admin-affiliates-unblock-${blockId}`}>
          Unblock
        </Button>
      }
      title="Unblock this Plex account?"
      description="It can join through affiliate invites again."
      confirmLabel="Unblock"
      pendingLabel="Unblocking"
      action={() => run(blockId)}
      data-testid="admin-affiliates-unblock-dialog"
      confirmTestId="admin-affiliates-unblock-confirm"
    />
  )
}
