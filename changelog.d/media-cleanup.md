### Added

- **Media cleanup** (Admin > Automations > Media cleanup): rules that find media nobody watches, a live preview with a reason for every title, and ten recipes to start from. A rule starts in Dry run and changes nothing until you turn it on.
- **Leaving soon:** matches wait for a grace period in a Plex collection on Home and on a new member page. Members can keep a title there. Then Radarr or Sonarr deletes them, inside a daily budget, after a fresh check for plays, Keeps and requests.
- **Protections, review and history:** global protections, admin exclusions, Review first batches and run history with audit rows. MCP tools to read cleanup state and change rules. Turning a rule on and approving deletions stay in the admin UI.
- **Members:** a Leaving soon page, a Home row and a Keeps list on Account.

### Upgrade notes

- **New tables:** the release adds database tables for media cleanup. Media cleanup is off after the upgrade, and nothing is deleted until an admin turns it on and turns a rule on.
- **Kometa with `delete_collections: { configured: false }`:** add `managed: true` beside it. Without it, Kometa deletes the Leaving soon collections every run. plex-manager makes them again within the hour and shows a warning.
- **Same paths:** Plex and Radarr or Sonarr must see media at the same paths. Titles whose files are outside the Radarr or Sonarr folders are never deleted.
