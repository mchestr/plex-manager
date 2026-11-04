"use client"

import { useRef, useTransition } from "react"

import { removeBrandAsset, uploadBrandAsset } from "@/actions/admin/brand-assets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SettingsSection } from "@/components/ui/settings-section"
import { useToast } from "@/components/ui/toast"
import { BRAND_ASSET_KINDS, BRAND_ASSET_MAX_BYTES, BRAND_ASSETS, formatList, type BrandAssetKind } from "@/lib/branding/assets"
import type { Branding } from "@/lib/branding/settings"
import { cn } from "@/lib/utils"

function BrandImageRow({ kind, url }: { kind: BrandAssetKind; url?: string }) {
  const spec = BRAND_ASSETS[kind]
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const upload = (file: File) =>
    startTransition(async () => {
      if (file.size > BRAND_ASSET_MAX_BYTES) {
        toast.showError(`Images can be at most ${BRAND_ASSET_MAX_BYTES / 1024} KB`)
        return
      }
      const result = await uploadBrandAsset({ kind, file })
      if (result.success) toast.showSuccess(`${spec.label} uploaded`)
      else toast.showError(result.error)
    })

  const remove = () =>
    startTransition(async () => {
      const result = await removeBrandAsset(kind)
      if (result.success) toast.showSuccess(`${spec.label} removed`)
      else toast.showError(result.error)
    })

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center" data-testid={`brand-image-${kind}`}>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted",
          kind === "wordmark" || kind === "login-background" ? "w-32" : "w-16"
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- images are unoptimized (next.config.js)
          <img
            src={url}
            alt=""
            className={cn("max-h-full max-w-full", kind === "login-background" ? "size-full object-cover" : "object-contain p-1")}
            data-testid={`brand-image-${kind}-preview`}
          />
        ) : (
          <span className="text-caption text-muted-foreground">Default</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-ui font-medium text-foreground">{spec.label}</p>
        <p className="text-caption text-muted-foreground">
          {spec.description} {formatList(kind)}, up to {BRAND_ASSET_MAX_BYTES / 1024} KB.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Input
          ref={input}
          type="file"
          accept={spec.types.join(",")}
          className="hidden"
          aria-label={`${spec.label} file`}
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) upload(file)
          }}
          data-testid={`brand-image-${kind}-input`}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={isPending}
          loadingLabel="Saving"
          onClick={() => input.current?.click()}
          data-testid={`brand-image-${kind}-upload`}
        >
          {url ? "Replace" : "Upload"}
        </Button>
        {url && (
          <Button variant="ghost" size="sm" disabled={isPending} onClick={remove} data-testid={`brand-image-${kind}-remove`}>
            Remove
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * Logos and images: the wordmark, icon, favicon and login background
 * (`lib/branding/assets.ts`). Each uploads or goes at once; without one the
 * app draws its default.
 */
export function BrandImagesSection({ assets }: { assets: Branding["assets"] }) {
  return (
    <SettingsSection id="brand-images" title="Logos and images" description="Each saves as soon as you choose a file.">
      <ul className="flex flex-col divide-y divide-border">
        {BRAND_ASSET_KINDS.map((kind) => (
          <BrandImageRow key={kind} kind={kind} url={assets[kind]} />
        ))}
      </ul>
    </SettingsSection>
  )
}
