### Added

- **Assistant skills:** add a GitHub repository of Agent Skills (`SKILL.md` folders) in Settings, Assistant sources, Skills. The admin assistant lists them and follows the one that matches a request. Pin a tag or commit. See `docs/assistant.md`.

### Changed

- **Database for assistant skills:** the database gets the `SkillSource` table. The next boot runs one automatic pass that re-encrypts the stored secrets, because a new secret column is added.
- **Knowledge base reads:** when GitHub rate-limits a knowledge base or skill read, the app waits a minute before asking GitHub again, instead of retrying on every message. A knowledge base pinned to a commit is cached at that commit.
