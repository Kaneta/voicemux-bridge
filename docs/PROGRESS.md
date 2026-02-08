## 2026-02-08
### Changed
- **Strict Token Enforcement:**
    - Removed fallback logic for unsecured connections in `background.js`.
    - If token fetching fails, the extension will retry with exponential backoff instead of connecting insecurely.
    - Updated URL construction to always mandate the `token` parameter.

### Added
- **Phoenix Token Authentication Implementation:**
    - Updated `background.js` to automatically fetch a signed token from `/api/auth` before connecting to the WebSocket.
    - Updated `popup.js` to include the auth token in the generated QR code (Pairing URL).
    - This enhances server security by preventing unauthorized WebSocket connections.

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
- **Version:** 1.4.0 (Auth Enforced)
- **Stability:** Stable. Strict token authentication enabled.

## Next Tasks
- [ ] Submit version 1.4.0 to the Chrome Web Store.
- [ ] Verify functionality with the new stricter logic.
