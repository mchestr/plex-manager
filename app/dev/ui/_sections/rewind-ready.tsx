"use client"

import { Bold, Table2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { LiveStatus } from "@/components/ui/live-status"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"

import { Row, Specimen } from "./specimen"

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** The share sheet's body, shared by the app-theme and ink specimens. */
export function ShareSheetBody({ id }: { id: string }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>Share this page</SheetTitle>
        <SheetDescription>Cards never show who else watches on this server.</SheetDescription>
      </SheetHeader>
      <SegmentedControl aria-label="Card format" defaultValue="story" data-testid={`${id}-format`}>
        <Segment value="story">Story</Segment>
        <Segment value="square">Square</Segment>
        <Segment value="wide">Wide</Segment>
      </SegmentedControl>
      <Toggle defaultPressed className="self-start">
        Show my first name
      </Toggle>
      <SheetFooter>
        <SheetClose render={<Button variant="ghost" />}>Cancel</SheetClose>
        <Button>Save the card</Button>
      </SheetFooter>
    </>
  )
}

export function SheetSpecimen() {
  return (
    <Specimen id="sheet" title="Sheet">
      <Row label="Sides">
        <Sheet>
          <SheetTrigger render={<Button variant="outline" data-testid="dev-ui-sheet-bottom-open" />}>
            Open the bottom sheet
          </SheetTrigger>
          <SheetContent side="bottom" grabber data-testid="dev-ui-sheet-bottom-content">
            <ShareSheetBody id="dev-ui-sheet-bottom" />
          </SheetContent>
        </Sheet>
        <Sheet>
          <SheetTrigger render={<Button variant="outline" data-testid="dev-ui-sheet-right-open" />}>
            Open the right sheet
          </SheetTrigger>
          <SheetContent side="right" data-testid="dev-ui-sheet-right-content">
            <SheetHeader>
              <SheetTitle>Assistant</SheetTitle>
              <SheetDescription>Ask about plays, members or the queues on this server.</SheetDescription>
            </SheetHeader>
            <p className="text-ui text-muted-foreground">No questions yet.</p>
          </SheetContent>
        </Sheet>
      </Row>
    </Specimen>
  )
}

export function ToggleSpecimen() {
  return (
    <Specimen id="toggle" title="Toggle">
      <Row label="States">
        <Toggle data-testid="dev-ui-toggle-table">
          <Table2 aria-hidden="true" />
          Show as table
        </Toggle>
        <Toggle defaultPressed>
          <Table2 aria-hidden="true" />
          Show as table
        </Toggle>
        <Toggle disabled>Disabled</Toggle>
      </Row>
      <Row label="Sizes">
        <Toggle size="sm" aria-label="Bold" defaultPressed>
          <Bold aria-hidden="true" />
        </Toggle>
        <Toggle size="sm">Small</Toggle>
        <Toggle>Default</Toggle>
      </Row>
    </Specimen>
  )
}

export function SliderSpecimen() {
  const [month, setMonth] = useState(7)
  return (
    <Specimen id="slider" title="Slider">
      <Row label="Month">
        <div className="flex w-72 flex-col gap-2">
          <Slider
            aria-label="Month"
            min={0}
            max={11}
            value={month}
            onValueChange={(value) => setMonth(value)}
            getAriaValueText={(_, value) => MONTHS[value] ?? ""}
            data-testid="dev-ui-slider-month"
          />
          <p className="text-label text-muted-foreground">Standings at the end of {MONTHS[month]}</p>
        </div>
      </Row>
      <Row label="Disabled">
        <Slider
          aria-label="Volume"
          className="w-72"
          defaultValue={40}
          disabled
          getAriaValueText={(formatted) => `${formatted} percent`}
        />
      </Row>
    </Specimen>
  )
}

export function LiveStatusSpecimen() {
  const [renderedAt] = useState(() => Date.now())
  const [paused, setPaused] = useState(false)
  return (
    <Specimen id="live-status" title="LiveStatus">
      <Row label="Live">
        <LiveStatus renderedAt={renderedAt} paused={paused} onPausedChange={setPaused} data-testid="dev-ui-live-status-demo" />
      </Row>
    </Specimen>
  )
}

export function SegmentedControlSpecimen() {
  return (
    <Specimen id="segmented-control" title="SegmentedControl">
      <Row label="Format">
        <SegmentedControl aria-label="Card format" defaultValue="story">
          <Segment value="story">Story</Segment>
          <Segment value="square">Square</Segment>
          <Segment value="wide">Wide</Segment>
        </SegmentedControl>
      </Row>
      <Row label="With a disabled segment">
        <SegmentedControl aria-label="Edition" defaultValue="short">
          <Segment value="short">Short list</Segment>
          <Segment value="full">Full issue</Segment>
          <Segment value="pocket" disabled>
            Pocket
          </Segment>
        </SegmentedControl>
      </Row>
    </Specimen>
  )
}
