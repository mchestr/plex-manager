"use client"

import { Copy, Ellipsis, RefreshCw, UserRound, UserX } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { Row, Specimen } from "./specimen"

export function DropdownMenuSpecimen() {
  return (
    <Specimen id="dropdown-menu" title="DropdownMenu">
      <Row label="Row actions">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="Actions for Sam Rivera" data-testid="dev-ui-menu-open" />}
          >
            <Ellipsis aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent data-testid="dev-ui-menu-content">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Sam Rivera</DropdownMenuLabel>
              <DropdownMenuItem icon={<UserRound />} data-testid="dev-ui-menu-first">
                View profile
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Copy />}>Copy email</DropdownMenuItem>
              <DropdownMenuItem icon={<RefreshCw />} disabled>
                Regenerate Rewind
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<UserX />} variant="destructive">
              Remove access...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>
    </Specimen>
  )
}

export function PopoverSpecimen() {
  return (
    <Specimen id="popover" title="Popover">
      <Row label="Explainer">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>What counts as a play?</PopoverTrigger>
          <PopoverContent>
            <PopoverTitle>What counts as a play</PopoverTitle>
            <PopoverDescription>
              Tautulli logs a play once someone watches more than half of an episode or film.
            </PopoverDescription>
          </PopoverContent>
        </Popover>
      </Row>
    </Specimen>
  )
}

export function TooltipSpecimen() {
  return (
    <Specimen id="tooltip" title="Tooltip">
      <Row label="Icon button">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Refresh libraries" />}>
            <RefreshCw aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Refresh libraries</TooltipContent>
        </Tooltip>
      </Row>
    </Specimen>
  )
}

export function ToastSpecimen() {
  const { showSuccess, showInfo, showError, toast } = useToast()
  return (
    <Specimen id="toast" title="Toast">
      <Row label="Tones">
        <Button variant="secondary" size="sm" onClick={() => showSuccess("Settings saved")}>
          Success
        </Button>
        <Button variant="secondary" size="sm" onClick={() => showInfo("Library scan started")}>
          Info
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid="dev-ui-toast-error"
          onClick={() => showError("Plex didn't answer. Check the server URL in Settings.")}
        >
          Error
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast({
              title: "Rewind generation failed",
              description: "Two members are affected.",
              tone: "error",
              action: { label: "Retry", onClick: () => showInfo("Generation queued") },
            })
          }
        >
          With action
        </Button>
      </Row>
    </Specimen>
  )
}
