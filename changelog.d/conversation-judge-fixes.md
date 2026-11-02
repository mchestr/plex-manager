### Changed

- **Conversation judge:** the judge now follows the **AI features** switch (**Admin > Settings > AI provider**). While AI features are off, no review can be queued, the nightly review queues nothing, and a review already queued fails before anything is sent to the judge's provider.
- **Conversation judge prompt:** the judge's instructions are now version `judge-v2`. Each review, and its usage row, records the version it ran with (`promptVersion`), so reviews made with v0.9.0 read `judge-v1`.
- **Conversation reviews:** the review failure messages and the MCP tool now call the judge's spend cap the **Daily budget**, as its setting already did.

### Fixed

- **Finding notes:** saving a note on a finding no longer marks it triaged again, so it stays in the Findings tab's figures for the day it was triaged instead of moving to the day of the note.
- **Stuck reviews:** a review whose job died no longer leaves the conversation page waiting. Once it is past its time limit, the page's status check marks it failed, as a review that stopped responding, and it can be started again.
- **Findings tab:** a finding whose quote did not match the conversation is marked **Unverified quote**, and **Open conversation** goes straight to the finding.
- **Conversation reviews:** a conversation with a message that can no longer be read no longer fails its review: the judge is told that the message is unreadable. A conversation whose newest turn, with the assistant's instructions and tools, is too long to review now fails with that reason, instead of sending the judge an empty turn.
- **Admin assistant:** a tool result, or a tool call's arguments, nested too deep to check for credentials no longer loses the assistant's answer to "The assistant could not answer. Try again." The conversation's tool log records it as not recorded.

### Security

- **Conversation judge:** credentials are now redacted from the messages and earlier findings the judge reads, as they already were from tool results, and a message, finding or tool call that is JSON nested too deep to check is withheld instead of sent. Invisible and control characters, such as zero-width spaces, can no longer hide a credential from redaction, and conversation content can no longer imitate the structure of the judge's prompt (its tags, message labels and notes), with or without them. Redaction finds credentials by their shape, so treat it as a safeguard, not a guarantee.
