### Fixed

- **Grant access after an inactivity removal:** a member can get access back through Grant access or a new Stripe subscription. That member now gets the full inactivity threshold again from that day. A sign-in with access already did this. Before, the grant cleared the end of access but did not record the return. The next member activity run then counted the member as inactive at once and removed them again.
