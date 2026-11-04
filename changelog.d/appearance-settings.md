### Upgrade notes

- **New migration:** `20270123100000_add_brand_appearance` adds `Config.loginSubtitle`, `Config.accentColor` and the `BrandAsset` table. The image runs it at start.

### Added

- **Appearance settings:** Admin, Settings, System has an Appearance section for the server name, a login subtitle and an accent colour (`#RRGGBB`), which every button, link and focus ring takes in both themes, adjusted to stay readable. A Logos and images section uploads a wordmark, an icon, a favicon and a login background (PNG, JPEG, WebP or SVG by slot, up to 768 KB each), served from `/api/branding/<kind>`. The wordmark replaces the name in every shell, the icon replaces the monogram on the sign-in pass, the app icons and the link preview card, and the background fills the sign-in screen.
