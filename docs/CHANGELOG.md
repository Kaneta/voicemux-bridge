# Changelog

## [2.2.2] - 2026-04-03
- Hidden stability only: normal pairing and text insertion UX did not change.
- The mobile pairing surface now re-announces presence after late peer joins and pauses/resumes cleanly across page hide, visibility, and online/offline changes.
- The extension worker now re-normalizes mobile presence on worker load and Chrome startup/install before reconnecting.
- Relay reconnect, purge, join-success, and wake decisions were split into small auditable helpers and covered by regression tests.

## [2.2.0] - 2026-03-27
- Popup copy now positions direct browser input as the primary use, while VoiceMuxHub is shown as an optional polish step.
- Trusted first-party pairing surfaces can sync the active room snapshot directly into the extension.
- Stale room handling was tightened so reset or invalid room state is surfaced more clearly.
