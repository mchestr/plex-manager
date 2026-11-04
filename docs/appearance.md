# Appearance

Admin > Settings > System holds the server's look, in two sections.

## Appearance

| Field | What it changes | Blank |
|---|---|---|
| Server name | The name in titles, the shells, the sign-in screen and Rewind | The active Plex (or Jellyfin) server's name |
| Login subtitle | A line under "Sign in to {name}" | No line |
| Accent colour | `#RRGGBB` for buttons, links, focus rings and the sidebar's active item | The default amber |

The accent is not used as-is everywhere: `lib/branding/accent.ts` keeps the
light theme's indicator and focus ring at 4.5:1 on the background and the dark
theme's primary at 3:1, and picks black or white text on each fill. Where
neither reaches 4.5:1, it darkens or lightens the fill a few steps until one
does: `#E4202B` becomes `#E01A28` behind white text. Rewind keeps its own inks.

## Logos and images

Each slot saves when you choose a file and goes back to the default when you
remove it. The type is read from the file's bytes, never its name. An SVG whose
DOCTYPE declares entities is refused; remove the DOCTYPE and upload it again.

| Slot | Where it shows | Formats |
|---|---|---|
| Logo (wordmark) | Top-left of every page, in place of the name | PNG, WebP, SVG |
| Logo (icon) | App and home-screen icons, the sign-in tile, the link preview card | PNG, JPEG, SVG |
| Favicon | The browser tab (64 px and below); without one, the icon | PNG, JPEG, SVG |
| Login background | Behind the sign-in card | JPEG, PNG, WebP |

Files can be up to 768 KB. ICO files are not accepted: upload a 64 px PNG or an
SVG favicon instead.

Images are stored in the database (`BrandAsset`) and served publicly from
`/api/branding/<kind>`, since the sign-in screen shows them before anyone signs
in. Links carry the image's hash (`?v=`), so browsers cache them for good and a
new upload shows at once. An uploaded SVG is served under a sandboxing Content
Security Policy, so opened on its own it runs no script.

## Example: Mikeflix

From the Mikeflix brand kit:

1. Appearance: server name `Mikeflix`, accent colour `#E4202B`.
2. Logo (wordmark): `logo/mikeflix-wordmark.svg` (or `mikeflix-wordmark-2000.png`).
3. Logo (icon): `icon/mikeflix-icon-512.png`.
4. Favicon: `favicon/favicon.svg` (or `favicon-64.png`).
5. Login background: `background/login-background-2560x1440.jpg`.
