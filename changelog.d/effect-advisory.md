### Security

- **Prisma's `effect` dependency:** pinned to 3.22.5 with an npm override, past the ReDoS in `Schema.TemplateLiteral` (GHSA-7589-6fvf-x4pw) that `prisma` 7.10.1 pulls in through `@prisma/config`. The override can go once Prisma ships a fixed `effect`.
