## 2026-02-08
### Added
- **Phoenix Token Authentication Implementation:**
    - Updated `background.js` to automatically fetch a signed token from `/api/auth` before connecting to the WebSocket.
    - Updated `popup.js` to include the auth token in the generated QR code (Pairing URL).
    - This enhances server security by preventing unauthorized WebSocket connections while maintaining backward compatibility.

## 2026-02-06
### Fixed
- **Manifest & Permissions Cleanup for Store Review:**
    - Bumped version to `1.3.2`.
    - Removed unused `scripting` permission from `manifest.json` and `PRIVACY.md` to comply with Chrome Web Store policies.
    - Removed redundant `wss://` host permissions (covered by `https://`).
- **Input Focus Logic (Treenoteweb Fix):**
    - Refactored `content.js` to prioritize the `activeElement` (focused input) over adapter defaults.
    - This fixes the issue on Treenoteweb where text was injected into the main content area instead of the focused chat input.

### Added
- **Documentation Driven Development Setup:**
    - Created `docs/` directory.
    - Added `docs/AGENTS.md` (Architecture), `docs/PROGRESS.md` (Log), and `docs/ADR_TEMPLATE.md`.

## Current Status
- **Version:** 1.4.0 (Auth Enhanced)
- **Stability:** Stable. Implemented token-based authentication.

## Next Tasks
- [ ] Submit version 1.4.0 to the Chrome Web Store.
- [ ] Verify token-based connection against the production server.
