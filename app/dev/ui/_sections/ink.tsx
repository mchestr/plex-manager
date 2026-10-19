"use client"

import { CircleCheck, Ellipsis, Pause, Settings, Table2, TriangleAlert, X } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { PortalContainerProvider } from "@/components/ui/portal-container"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { inkProps, type InkName } from "@/lib/design/tokens"
import { cn } from "@/lib/utils"

import { MONTHS, ShareSheetBody } from "./rewind-ready"
import { Row } from "./specimen"

const INKS = ["paper", "marigold", "ultramarine"] as const satisfies readonly InkName[]

/** Popups inside the scope print on paper (one object, so `useToast` stays stable). */
const ON_PAPER = { ...inkProps("paper") }

/**
 * The primitives in the Rewind scope (ui-design-system 4.4): each panel is a
 * scope root with one ink, and its popups portal into the root and print on
 * paper. Nothing here is a copy: the same components read the remapped
 * tokens.
 */
export function InkSpecimen() {
  return (
    <section aria-labelledby="dev-ui-ink-title" data-testid="dev-ui-ink" className="flex flex-col gap-4">
      <h2 id="dev-ui-ink-title" className="text-h2">
        In the Rewind scope
      </h2>
      {INKS.map((ink) => (
        <InkPanel key={ink} ink={ink}>
          <InkPrimitives ink={ink} />
        </InkPanel>
      ))}
    </section>
  )
}

function InkPanel({ ink, children }: { ink: InkName; children: ReactNode }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const field = inkProps(ink)
  return (
    <div data-theme="rewind" ref={setRoot}>
      <section
        {...field}
        aria-label={`${ink} ink`}
        data-testid={`dev-ui-ink-${ink}`}
        className={cn(field.className, "flex flex-col gap-5 rounded-lg bg-background p-5 text-foreground")}
      >
        <PortalContainerProvider container={root} popupProps={ON_PAPER}>
          {children}
        </PortalContainerProvider>
      </section>
    </div>
  )
}

function InkPrimitives({ ink }: { ink: InkName }) {
  const id = `dev-ui-ink-${ink}`
  const [shortcuts, setShortcuts] = useState(true)
  const [month, setMonth] = useState(7)
  const { showSuccess } = useToast()
  return (
    <>
      <Row label="Rewind buttons">
        <Button variant="ink" size="pill" data-testid={`${id}-button`}>
          Share the poster
        </Button>
        <Button variant="ink-outline" size="pill">
          Share this page
        </Button>
        <Button variant="ink-outline" size="icon-pill" aria-label="Settings">
          <Settings aria-hidden="true" />
        </Button>
        <Button variant="ink-outline" size="icon-pill" aria-label="Pause">
          <Pause aria-hidden="true" />
        </Button>
        <Button variant="ink-outline" size="icon-pill" aria-label="Close">
          <X aria-hidden="true" />
        </Button>
        <Button variant="ink-outline" size="pill" disabled>
          Disabled
        </Button>
      </Row>
      <Row label="App buttons">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </Row>
      <Row label="Controls">
        <span className="flex items-center gap-3">
          <Switch id={`${id}-shortcuts`} checked={shortcuts} onCheckedChange={setShortcuts} />
          <Label htmlFor={`${id}-shortcuts`}>Keyboard shortcuts</Label>
        </span>
        <span className="flex items-center gap-2">
          <Checkbox id={`${id}-slower`} defaultChecked />
          <Label htmlFor={`${id}-slower`}>Slower pacing</Label>
        </span>
        <Toggle defaultPressed>
          <Table2 aria-hidden="true" />
          Show as table
        </Toggle>
        <SegmentedControl aria-label="Card format" defaultValue="story">
          <Segment value="story">Story</Segment>
          <Segment value="square">Square</Segment>
        </SegmentedControl>
      </Row>
      <Row label="Slider">
        <div className="flex w-72 flex-col gap-2">
          <Slider
            aria-label="Month"
            min={0}
            max={11}
            value={month}
            onValueChange={(value) => setMonth(value)}
            getAriaValueText={(_, value) => MONTHS[value] ?? ""}
          />
          <p className="text-label">Standings at the end of {MONTHS[month]}</p>
        </div>
      </Row>
      <Row label="Status">
        <StatusBadge tone="success" label="Ready" icon={CircleCheck} />
        <StatusBadge tone="warning" label="Partial year" icon={TriangleAlert} />
        <Badge variant="outline">Admin</Badge>
        <Spinner label="Loading" />
        <Skeleton className="h-4 w-24" />
      </Row>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>Your first name</FieldLabel>
          <Input defaultValue="Sam" />
        </Field>
        <Card>
          <CardHeader>
            <CardTitle>Top shows</CardTitle>
            <CardDescription>Counted from 1 January to 30 November.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert tone="info" title="Partial year">
              Your server started logging plays in March.
            </Alert>
          </CardContent>
        </Card>
      </div>
      <Row label="Popups on paper">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="About the words" />}>
            <Ellipsis aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>About the words</TooltipContent>
        </Tooltip>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>Why this?</PopoverTrigger>
          <PopoverContent>
            <PopoverTitle>Why this archetype</PopoverTitle>
            <PopoverDescription>Most of your plays started after 10 PM.</PopoverDescription>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>Contents</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>01 Cover</DropdownMenuItem>
            <DropdownMenuItem>05 Top shows</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Sheet>
          <SheetTrigger render={<Button variant="outline" size="sm" data-testid={`${id}-sheet-open`} />}>
            Share sheet
          </SheetTrigger>
          <SheetContent side="bottom" grabber data-testid={`${id}-sheet-content`}>
            <ShareSheetBody id={`${id}-sheet`} />
          </SheetContent>
        </Sheet>
        <Button variant="outline" size="sm" data-testid={`${id}-toast`} onClick={() => showSuccess("Card saved")}>
          Toast
        </Button>
      </Row>
    </>
  )
}
