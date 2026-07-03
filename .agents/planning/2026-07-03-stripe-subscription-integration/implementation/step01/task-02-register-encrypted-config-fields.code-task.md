# Task: Register Stripe secret Config fields for at-rest encryption

## Description
Ensure the Stripe secret key and webhook signing secret are encrypted at rest by
registering them with the existing Prisma encryption extension, consistent with how
other service credentials are stored.

## Background
`lib/prisma.ts` defines an `ENCRYPTED_FIELDS` map (model → field names) used by a
Prisma query extension that transparently encrypts on write and decrypts on read via
AES-256-GCM (`lib/security/crypto.ts`), using the `enc:v1:` prefix. Encryption is a
no-op when `ENCRYPTION_KEY` is unset and tolerates legacy plaintext. Existing entries
include `LLMProvider: ['apiKey']` and `DiscordConnection: ['accessToken','refreshToken']`.
The Stripe secret key and webhook secret are sensitive and MUST be encrypted; price ids
and the enabled flag are NOT secret and must remain plaintext (they are read/filtered
directly). See `research/data-model.md` and `design/detailed-design.md` §5.

## Technical Requirements
1. Add a `Config` entry to `ENCRYPTED_FIELDS` listing exactly `stripeSecretKey` and
   `stripeWebhookSecret`.
2. Do NOT encrypt `stripePriceIds` or `stripeEnabled`.
3. Preserve the existing no-op behavior when `ENCRYPTION_KEY` is unset and the
   legacy-plaintext read tolerance.

## Dependencies
- Task-01 (the `Config` fields must exist in the schema/generated client).
- `lib/prisma.ts` encryption extension; `lib/security/crypto.ts`.

## Implementation Approach
1. Add `Config: ['stripeSecretKey', 'stripeWebhookSecret']` to the `ENCRYPTED_FIELDS`
   map in `lib/prisma.ts`, matching the existing formatting.
2. Verify the extension already covers all Prisma operations generically (no per-model
   wiring needed beyond the map entry).

## Acceptance Criteria

1. **Secrets encrypted on write**
   - Given `ENCRYPTION_KEY` is set and a `Config` row is written with a
     `stripeSecretKey`/`stripeWebhookSecret`
   - When the row is persisted
   - Then the stored values carry the `enc:v1:` prefix (not plaintext).

2. **Secrets decrypted on read**
   - Given an encrypted `Config` row
   - When it is read through the Prisma client
   - Then `stripeSecretKey`/`stripeWebhookSecret` are returned as plaintext to callers.

3. **Non-secret fields untouched**
   - Given a `Config` row with `stripePriceIds` and `stripeEnabled`
   - When written and read
   - Then those values are stored/returned as plaintext (never `enc:v1:`).

4. **No-op without key**
   - Given `ENCRYPTION_KEY` is unset
   - When the secret fields are written and read
   - Then values pass through unchanged (backward compatible with existing behavior).

5. **Unit test coverage**
   - Given the encryption extension tests
   - When the suite runs
   - Then tests cover encrypt/decrypt round-trip for the two new `Config` secret fields,
     mirroring existing encrypted-field tests.

## Metadata
- **Complexity**: Low
- **Labels**: security, encryption, prisma, config, stripe
- **Required Skills**: TypeScript, Prisma extensions, applied cryptography basics
