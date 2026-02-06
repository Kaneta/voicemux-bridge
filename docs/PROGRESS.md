# Development Progress Log

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
- **Version:** 1.3.2
- **Stability:** Stable. Ready for store submission.

## Next Tasks
- [ ] Verify Treenoteweb fix in a live environment if possible.
- [ ] Submit version 1.3.2 to the Chrome Web Store.
- [ ] Consider adding unit tests for `content.js` adapter logic.
