# Task: Documentation for Stripe subscription setup

## Description
Document how to configure and operate the Stripe subscription feature, and update the
project integration docs.

## Background
Operators need to know how to obtain/enter keys, configure the webhook endpoint, set
price IDs, and enable the feature; developers need the integration recorded in
`CLAUDE.md`. See `design/detailed-design.md` §8.4 (build-time open items) and the
existing docs conventions.

## Technical Requirements
1. Add `docs/stripe.md` covering: required config (secret key, webhook secret, price
   IDs), the webhook endpoint URL/path to register in Stripe, enabling the master toggle
   (and the "block until configured" rule), grandfathering behavior, and the cancel/
   removal lifecycle.
2. Update the `CLAUDE.md` integration section with a Stripe entry (endpoints/conventions
   consistent with the other integrations).
3. Note the build-time open items (SDK version / `apiVersion`, period-end field path,
   webhook endpoint API version) so implementers verify them.
4. Update `example.env`/config docs if any Stripe-related env or notes are warranted.

## Dependencies
- Feature implemented (steps 1–11) so docs match reality.

## Implementation Approach
1. Write operator-facing setup steps first, then developer notes.
2. Keep it concise and consistent with existing docs style.

## Acceptance Criteria

1. **Setup doc exists**
   - Given `docs/stripe.md`
   - When read
   - Then it explains configuration, webhook registration, enabling, grandfathering, and
     the cancellation/removal lifecycle.

2. **CLAUDE.md updated**
   - Given the integration section
   - When read
   - Then a Stripe entry is present and consistent with other integrations.

3. **Open items recorded**
   - Given the docs
   - When read
   - Then the build-time verification items (SDK/apiVersion, period-end path, webhook API
     version) are listed.

4. **Config guidance accurate**
   - Given the config/env notes
   - When followed
   - Then they match the actual admin settings and behavior.

## Metadata
- **Complexity**: Low
- **Labels**: documentation, stripe, ops
- **Required Skills**: Technical writing
