### Security

- **Disabled members and Plex invites:** a disabled member who opens a valid Plex invite no longer gets the server shared again or a Stripe exemption. The redemption refuses the account before it counts the use, and the sign-in ends as it does for any disabled account.
- **Plex invites record before they share:** a Plex invite now records the member, their exemption and the use before it shares the server. If the share fails, the redemption removes that record and gives the use back. Before, a record that failed after the share left the person with access but no record and no exemption. If Plex's automatic accept fails, the redemption now stays, because the share exists: the member can accept it in Plex.
