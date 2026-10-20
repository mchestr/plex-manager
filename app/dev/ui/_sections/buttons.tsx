import { ArrowUpRight, Plus, Save, Settings, Trash2 } from "lucide-react"
import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

import { Row, Specimen } from "./specimen"

const VARIANTS = ["primary", "secondary", "outline", "ghost", "destructive", "destructive-solid", "link"] as const

export function ButtonSpecimen() {
  return (
    <Specimen id="button" title="Button">
      {VARIANTS.map((variant) => (
        <Row key={variant} label={variant}>
          <Button variant={variant}>Save changes</Button>
          <Button variant={variant} icon={<Icon icon={Plus} />}>
            Create invite
          </Button>
          <Button variant={variant} disabled>
            Disabled
          </Button>
        </Row>
      ))}
      <Row label="Sizes">
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" variant="outline" aria-label="Settings">
          <Icon icon={Settings} />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Delete invite">
          <Icon icon={Trash2} />
        </Button>
      </Row>
      <Row label="Loading">
        <Button loading loadingLabel="Saving" icon={<Icon icon={Save} />}>
          Save changes
        </Button>
        <Button loading={false} loadingLabel="Saving" icon={<Icon icon={Save} />}>
          Save changes
        </Button>
        <Button variant="secondary" loading loadingLabel="Testing">
          Test connection
        </Button>
      </Row>
      <Row label="Links">
        <Button render={<Link href="/dev/ui" />} nativeButton={false} variant="outline">
          Open as a link
        </Button>
        <Button render={<a href="https://www.plex.tv" />} nativeButton={false} variant="link">
          Plex website
          <Icon icon={ArrowUpRight} />
        </Button>
        <Link href="/dev/ui" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Styled with buttonVariants
        </Link>
      </Row>
    </Specimen>
  )
}
