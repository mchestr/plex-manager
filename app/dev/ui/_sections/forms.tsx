"use client"

import { Search } from "lucide-react"
import { useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { FormField } from "@/components/ui/form-field"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { Row, Specimen } from "./specimen"

export function InputSpecimen() {
  return (
    <Specimen id="input" title="Input and Textarea">
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>Server name</FieldLabel>
          <Input defaultValue="Northfield Plex" />
        </Field>
        <Field>
          <FieldLabel>Tautulli URL</FieldLabel>
          <Input type="url" placeholder="http://localhost:8181" />
        </Field>
        <Field>
          <FieldLabel optional>Discord invite</FieldLabel>
          <Input leading={<span className="text-ui">discord.gg/</span>} placeholder="northfield" />
        </Field>
        <Field>
          <FieldLabel>Search members</FieldLabel>
          <Input leading={<Icon icon={Search} />} type="search" placeholder="Name or email" />
        </Field>
        <Field disabled>
          <FieldLabel>Plex client id</FieldLabel>
          <Input defaultValue="plex-manager-7f3a" />
        </Field>
        <Field>
          <FieldLabel>Start date</FieldLabel>
          <Input type="date" defaultValue="2026-10-01" />
        </Field>
      </div>
      <Field>
        <FieldLabel optional>Welcome message</FieldLabel>
        <Textarea placeholder="Shown to members after they accept the invite." />
      </Field>
    </Specimen>
  )
}

export function FieldSpecimen() {
  return (
    <Specimen id="field" title="Field and FormField">
      <div className="grid gap-6 md:grid-cols-2">
        <FormField name="overseerrUrl" label="Overseerr URL" description="Members request titles here.">
          <Input defaultValue="http://overseerr.local:5055" />
        </FormField>
        <FormField
          name="sonarrUrl"
          label="Sonarr URL"
          changedFrom="http://localhost:8989"
          description="Include the port and any URL base."
        >
          <Input defaultValue="http://sonarr.local:8989/sonarr" />
        </FormField>
        <FormField name="radarrKey" label="Radarr API key" error="Radarr rejected this key. Copy it again from Settings, General.">
          <Input defaultValue="0b9e4c" />
        </FormField>
        <Field invalid>
          <FieldLabel>Announcement</FieldLabel>
          <Textarea defaultValue="Maintenance tonight" />
          <FieldDescription>Markdown is allowed.</FieldDescription>
          <FieldError>Add the start and end time.</FieldError>
        </Field>
      </div>
    </Specimen>
  )
}

export function CheckboxSpecimen() {
  const [checked, setChecked] = useState(true)
  return (
    <Specimen id="checkbox" title="Checkbox">
      <Row label="States">
        <Checkbox aria-label="Unchecked" />
        <Checkbox aria-label="Checked" defaultChecked />
        <Checkbox aria-label="Disabled" disabled />
        <Checkbox aria-label="Disabled and checked" disabled defaultChecked />
      </Row>
      <Row label="Labelled">
        <div className="flex items-start gap-3">
          <Checkbox id="dev-ui-checkbox-active" checked={checked} onCheckedChange={setChecked} className="mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="dev-ui-checkbox-active">Show on the home page</Label>
            <p className="text-label text-muted-foreground">Members see it until it expires.</p>
          </div>
        </div>
      </Row>
    </Specimen>
  )
}

export function SwitchSpecimen() {
  const [sync, setSync] = useState(true)
  const [digest, setDigest] = useState(false)
  return (
    <Specimen id="switch" title="Switch">
      <Row label="States">
        <span className="flex items-center gap-3">
          <Switch id="dev-ui-switch-sync" checked={sync} onCheckedChange={setSync} />
          <Label htmlFor="dev-ui-switch-sync">Watchlist Sync</Label>
          <span className="text-label text-muted-foreground">{sync ? "On" : "Off"}</span>
        </span>
        <span className="flex items-center gap-3">
          <Switch id="dev-ui-switch-digest" checked={digest} onCheckedChange={setDigest} />
          <Label htmlFor="dev-ui-switch-digest">Weekly digest</Label>
        </span>
      </Row>
      <Row label="Disabled and busy">
        <Switch checked={false} onCheckedChange={() => {}} disabled label="Disabled off" />
        <Switch checked onCheckedChange={() => {}} disabled label="Disabled on" />
        <Switch checked onCheckedChange={() => {}} loading label="Saving" />
        <Switch checked={false} onCheckedChange={() => {}} loading label="Saving off" />
      </Row>
    </Specimen>
  )
}

const ACCESS = [
  { value: "all", label: "All" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
]

const MODELS = [
  { group: "OpenAI", items: [{ value: "gpt-4o", label: "gpt-4o" }] },
  { group: "Anthropic", items: [{ value: "claude-sonnet", label: "claude-sonnet" }] },
]

export function SelectSpecimen() {
  const [access, setAccess] = useState<string | null>("all")
  return (
    <Specimen id="select" title="Select">
      <div className="grid gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel nativeLabel={false} render={<div />}>
            Plex access
          </FieldLabel>
          <Select items={ACCESS} value={access} onValueChange={setAccess}>
            <SelectTrigger data-testid="dev-ui-select-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`dev-ui-select-option-${item.value}`}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel nativeLabel={false} render={<div />}>
            Model
          </FieldLabel>
          <Select items={MODELS.flatMap((group) => group.items)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((group) => (
                <SelectGroup key={group.group}>
                  <SelectLabel>{group.group}</SelectLabel>
                  {group.items.map((item) => (
                    <SelectItem key={item.value} value={item.value} label={item.label}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field disabled>
          <FieldLabel nativeLabel={false} render={<div />}>
            Time zone
          </FieldLabel>
          <Select items={[{ value: "utc", label: "UTC" }]} defaultValue="utc">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="utc">UTC</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Row label="Filter trigger">
        <Select items={ACCESS} defaultValue="yes">
          <SelectTrigger size="sm" aria-label="Plex access" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCESS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
    </Specimen>
  )
}
