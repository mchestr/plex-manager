# Affiliate invites

An affiliate is a member who can invite people to your Plex server. A member
applies on their **Invites** page. Only an admin can approve an application.

The feature is off by default. To turn it on, go to **Admin > Affiliates >
Settings**.

## Who can apply

A member can apply when all of these are true:

- They sign in with Plex, they have full access, and the Plex server is shared
  with them now.
- They do not pay for a subscription. A subscription that is `ACTIVE` or
  `PAST_DUE` counts as paid.
- Their account is not disabled.
- Their total watch hours in Tautulli are more than the hours of the first
  tier.
- They have no pending application.
- No admin refused or revoked them in the last 30 days.

Before you approve an application, the app does these checks again with live
data. If a check fails, the app tells you why and does not approve.

## Tiers

The tiers set how many invites an affiliate can make in 30 days. An affiliate
gets the invites of the highest tier that their total watch hours are more
than. Below the first tier, they get 0. The defaults are:

| Total watch hours | Invites per 30 days |
| --- | --- |
| More than 50 | 1 |
| More than 200 | 2 |
| More than 500 | 3 |

You can set 1 to 5 tiers. Each tier must have more hours than the tier before
it, and from 1 to 10 invites.

On the **Affiliates** tab, you can set a number for one affiliate, from 0 to
10. This number replaces their tier. 0 pauses the affiliate, but does not
revoke them.

## Slots

The 30 days roll: each day, the app counts the last 30 days. An invite uses a
slot only when a person joins with it. An open invite holds a slot until it is
used, cancelled or expired. When an invite expires or is cancelled, the slot
is free again.

## Server cap

The server cap is the number of people who can join with affiliate invites in
30 days, from all affiliates together. Set a number from 0 to 1000.

- Empty: no cap.
- 0: no new affiliate invites.

The Settings tab also shows how many users the Plex server shares with now.

## The invites

Each affiliate invite:

- is for one Plex account only;
- expires after 48 hours;
- shares the libraries in the library list on the Settings tab. The app copies
  the list when the affiliate makes the invite. Downloads are always off.

## Who can join with an invite

Only a new Plex account can join. The app refuses:

- a Plex account on the block list;
- a Plex account that has the email of a disabled account;
- an account that joined by an invite before, is exempt, or has a
  subscription;
- a Plex account that the server is shared with now.

A person who joins does not pay. The app makes them exempt, with the note
"Joined by member invite".

## Ending an affiliate

- **Disable, Remove and Unshare** end the affiliate status of that member.
  The member can apply again when they have access again.
- **Revoke** ends the status. You can give a reason, and the member sees it.
  The member must wait 30 days before they apply again.
- **Remove** can also block the Plex account of the member that you remove.
  Then no affiliate invite accepts that account. The app keeps only a keyed
  hash of the Plex id, not the Plex id. An admin can unblock the account on
  the **History** tab.

When a status ends, the open invites of that affiliate are cancelled. The
people who joined stay members.

## The switch

The **Affiliate invites** switch is off by default. You cannot turn it on
until:

- you select one or more libraries;
- Tautulli is connected;
- the active Plex server sends its server ID.

When you turn the switch on, the app keeps the ID of the Plex server. You
cannot clear the library list while the switch is on.

When you turn the switch off, the app cancels all open affiliate invites.
Affiliates, used invites and history stay.

When you change the Plex server, the switch goes off and the open invites are
cancelled. A library number can be a different library on a different server.
Make sure that the library list is correct, then turn the switch on again.

## The Support role

The Support role can see the Applications, Affiliates and Invite tree tabs.
Support cannot approve, refuse, revoke or change an affiliate. Support cannot
see the History or Settings tabs.

## Retention

`RETENTION_AFFILIATE_DAYS` (default 365) sets how many days the app keeps:

- refused, revoked, ended and closed applications;
- affiliate invites that nobody used, after they expire or are cancelled.

When you remove a member, the app deletes their applications and their unused
invites. A used invite stays as the join record of the person who joined, but
without the ID of the removed member. See [Privacy](privacy.md).

## Accepted risk

A member who pays can ask an affiliate to invite a second Plex account. That
account then has free access. The app cannot link the two accounts.
