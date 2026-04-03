# VoiceMux Bridge

VoiceMux Bridge is a Chrome extension that receives encrypted room traffic, decrypts it locally, and injects text into the active web page on your PC.

## Role

- Receives encrypted relay traffic and injects text into the active page.
- Stores synced room/auth state from trusted first-party pairing surfaces.
- Exposes a minimal popup for pairing, launch, and reset.
- Treats draft text as room-level state; `CLEAR` should wipe the active page draft without forcing a full room re-pair.

Reset semantics memo: `docs/RESET_ROOM_SPEC_JA.md`

## Security Boundary

- The extension does not issue rooms or tokens.
- The extension does not generate QR pairing URLs.
- The extension accepts `SYNC_AUTH` only from trusted first-party origins declared in `manifest.json`.
- Trusted staging surfaces must also be declared there when Cloudflare Pages staging is used.
- The extension stores room credentials in `chrome.storage.local` and performs decryption inside the background service worker before dispatching plaintext to the active tab.

The extension does not own QR pairing UX. Trusted first-party VoiceMux web surfaces sync the current room snapshot into the extension, while VoiceMuxHub remains the review/polish surface when needed.

## Local Development

```bash
npm install
npm run lint:ai
```

Load the extension from this directory in Chrome developer mode.

## License

This repository is licensed under MIT. See `LICENSE`.
