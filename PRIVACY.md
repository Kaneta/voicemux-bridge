# Privacy Policy for VoiceMux Bridge

Last updated: 2026-03-27

## 1. Data Collection
VoiceMux Bridge does **not** send your browsing history, page contents, or typed text to our servers as plaintext.

The extension stores only the minimum local state needed to operate:

- room credentials required to join the current relay room
- your local extension settings
- optional custom site adapters that you configure yourself
- temporary debug events stored locally for troubleshooting

## 2. End-to-End Encryption (E2EE)
Room text sent from the mobile device to the extension is encrypted with client-side AES-GCM before it reaches the relay server.

- **Decryption Keys**: Keys are generated on the trusted first-party desktop pairing surface and pushed to the extension through Chrome's internal extension messaging API (`SYNC_AUTH`). They are stored in `chrome.storage.local`.
- **Local Decryption**: Decryption happens inside the extension background service worker. Content scripts receive plaintext only after the extension has decrypted it locally.
- **Zero-Knowledge Key Transport**: The encryption key is carried to the mobile device via the URL hash fragment (`#key=...`). Hash fragments are handled by the browser and are not sent to the server by design.

## 3. Permissions
The extension requires the following permissions to function:
- **activeTab**: Used to identify and interact with the currently active page when the paired room sends an explicit command.
- **storage**: Used to store room credentials, local settings, and custom adapters.
- **alarms**: Used to keep the Manifest V3 background worker healthy enough to maintain relay connectivity.

The extension also declares host permissions for the VoiceMux first-party origins used for relay status, pairing, and review/polish handoff.

## 4. Third-Party Services
VoiceMux Bridge can inject text into third-party websites that you choose to use (for example ChatGPT, Gemini, Gmail, Slack, or Notion). Those websites are outside our control and have their own privacy policies.

When you choose to open VoiceMuxHub for review or polishing, that flow is handled by our first-party web surfaces (`hub.knc.jp` and `pair.knc.jp`) plus the relay service at `v.knc.jp`.

## 5. Contact
If you have any questions about this Privacy Policy, please open an issue on our [GitHub repository](https://github.com/Kaneta/voicemux-bridge).
