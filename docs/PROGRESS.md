## 2026-02-15
### Added
- **Numbered Onboarding UI:**
    - Redesigned `popup.html` into a step-by-step guide (1-4) to improve first-time user experience.
    - Explicitly added "Refresh the page" as Step 2 to ensure the content script is correctly loaded.
- **Quick Access Links:**
    - Added direct links to the **Web Monitor (v.knc.jp)** and **Support/FAQ (GitHub)** within the popup.
- **Multi-language Documentation:**
    - Organized `USER_GUIDE_JA.md` and `USER_GUIDE_EN.md` for international users.

### Changed
- **Highly Compatible Text Injection (v1.6.0):**
    - Refactored `content.js` to use `InputEvent` combined with direct `textContent` assignment.
    - This fix enables seamless input into complex editors like **Gmail** and **Gemini** without breaking their internal state.
- **Permission & Security Cleanup:**
    - Bumped version to `1.6.0`.
    - Cleaned up `host_permissions` in `manifest.json`, removing deprecated domains (`voice.kaneta.net`, `gemini.google.com`, etc.) to minimize required privileges.
    - Removed unused `scripting` permission to comply with Chrome Web Store policies.
- **Universal Site Support:**
    - Restored `"<all_urls>"` in `content_scripts.matches` to enable the "Input into any website" feature, while excluding `knc.jp` domains to prevent sync conflicts with the server's native logic.

## 2026-02-14
### Changed
- **Multi-Domain Support:**
    - Expanded support to include both `v.knc.jp` (Zen mode) and `t.knc.jp` (Translate mode).
    - Updated `manifest.json` with new permissions.
- **Domain Migration:**
    - Migrated the primary server domain from `voice.kaneta.net` to `v.knc.jp`.

## Current Status
- **Version:** 1.6.0 (High Compatibility Release)
- **Stability:** High. Verified on Gmail, Gemini, and ChatGPT.

## Next Tasks
- [x] Create Store Submission Package (voicemux_v1.6.0.zip).
- [ ] Submit version 1.6.0 to the Chrome Web Store.
