## 2026-02-12
### Added
- **User-Friendly Documentation:**
    - Created `USER_GUIDE.md` with clear instructions, emphasizing the use of smartphone keyboards (Gboard/iOS) for familiar voice input and correcting icon descriptions (Microphone Stand).
- **Dynamic Content Script Injection:**
    - Modified `popup.js` to dynamically inject `content.js` into the active tab upon opening the popup. This enables support for any website without requiring persistent `<all_urls>` permissions.
- **Real-time Adapter Synchronization:**
    - Added a storage listener to `content.js` that automatically reloads site adapters when the user saves changes in the Options page.

### Changed
- **Permission Minimization (Security):**
    - Bumped version to `1.4.1`.
    - Removed `<all_urls>` from `content_scripts` in `manifest.json` to comply with the Principle of Least Privilege.
    - Added `scripting` permission to support dynamic injection.
- **Robustness Improvements:**
    - Refactored `content.js` with an initialization guard and a loading Promise to prevent race conditions during adapter initialization.
- **How2Context Standard Update:**
    - Updated `collect_context.sh` to match the `@How2Context` standard.
    - Output file changed to `full_context.txt` in the project root.
    - Integrated `gen_map.sh` for automatic codebase mapping in context collection.
- **Git Hygiene Management:**
    - Moved all AI-specific helper scripts (`collect_context.sh`, `gen_map.sh`) and ignore patterns (`full_context.txt`, `project_map.md`) from `.gitignore` to `.git/info/exclude`.
    - This ensures the public repository is completely free of AI-specific toolchain artifacts while maintaining local productivity.

### Added
- **Codebase Mapping Tool:**
    - Added `gen_map.sh` from `@How2Context` to support structural codebase analysis.

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
