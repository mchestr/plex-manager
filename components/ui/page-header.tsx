import type { Route } from "next"
import Link from "next/link"
import { Fragment, type ReactNode } from "react"

import { cn } from "@/lib/utils"

interface Breadcrumb {
  label: string
  /** Omit on the current page, which renders as plain text with `aria-current`. */
  href?: Route
}

interface PageHeaderProps {
  /** The nav label, or the entity name on a detail page. */
  title: string
  description?: ReactNode
  breadcrumbs?: Breadcrumb[]
  /** Buttons only: secondary first, primary last. */
  actions?: ReactNode
  /** Badges or a status line under the title. */
  meta?: ReactNode
  className?: string
  /** `admin-<area>-header` by convention. */
  "data-testid"?: string
}

/**
 * The top of an admin page (ui-design-system 5.5 and 6.3, UI-21): breadcrumbs
 * in a Breadcrumb landmark, the page's one h1, a description, a meta line and
 * the actions. Back links are breadcrumbs only.
 */
export function PageHeader({ title, description, breadcrumbs, actions, meta, className, ...props }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-3", className)} data-testid={props["data-testid"]}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-label text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 && (
                  <li aria-hidden="true" className="select-none">
                    /
                  </li>
                )}
                <li>
                  {crumb.href ? (
                    <Link href={crumb.href} className="rounded-sm hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-foreground">
                      {crumb.label}
                    </span>
                  )}
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-h1">{title}</h1>
          {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
          {description && <p className="max-w-prose text-ui text-muted-foreground">{description}</p>}
        </div>
        {actions && (
          <div data-slot="page-header-actions" className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}
