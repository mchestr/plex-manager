### Added

- **Remove Sonarr or Radarr:** each Sonarr or Radarr row that is set up in **Admin > Settings** has a Remove button, behind a confirmation that says what stops working. Removal deletes every stored row of that service, including old ones that still hold API keys, and writes an audit event.

### Changed

- **Sonarr and Radarr descriptions:** the connection rows say what each service feeds. Sonarr feeds the assistant's show lookups, Rewind's returning shows and Discord media links. Radarr feeds the assistant's movie lookups and Discord media links.
