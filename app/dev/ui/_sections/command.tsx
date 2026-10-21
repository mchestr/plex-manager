"use client"

import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"

import { Specimen } from "./specimen"

/** The admin command menu's content (P10.16) as it looks open after typing "mor"; the real one opens on Ctrl K. */
export function CommandSpecimen() {
  return (
    <Specimen id="command" title="Command">
      <div className="max-w-[480px] overflow-hidden rounded-xl border border-border-strong shadow-dialog">
        <Command label="Command menu specimen" shouldFilter={false} vimBindings={false} defaultValue="user:morgan">
          <CommandInput value="mor" readOnly placeholder="Search members, invite codes and pages" />
          <CommandList>
            <CommandGroup heading="Members">
              <CommandItem value="user:morgan">
                <Icon icon={icons.users} />
                <span className="truncate">Morgan Lee</span>
                <CommandShortcut>morgan@example.com, Member</CommandShortcut>
              </CommandItem>
              <CommandItem value="user:morris">
                <Icon icon={icons.users} />
                <span className="truncate">Sam Morris</span>
                <CommandShortcut>sam@example.com, Admin</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Invites">
              <CommandItem value="invite:more2026">
                <Icon icon={icons.invites} />
                <span className="truncate">MORE2026</span>
                <CommandShortcut>Plex, 1 of 5 used</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </Specimen>
  )
}
