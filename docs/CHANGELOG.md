# Changelog

All notable changes to **VoiceMux Bridge** will be documented in this file.

## [1.6.1] - 2026-02-17
### Added
- **Transparency Reports**: Added detailed documentation on "Why we need All Site Access" and "E2EE Implementation Proof."
- **Developer Profile**: Linked to official Google Play Store profile to establish trust.
- **Sustainability Policy**: Added a section explaining why the service is free and how it stays resilient.

### Changed
- **Cross-Platform Compatibility**: Improved Base64 handling for 100% key compatibility with Go and Mobile clients.
- **Stability**: Added periodic heartbeat alarms to maintain WebSocket connections in Manifest V3.
- **Protocol**: Standardized on Phoenix Protocol vsn=2.0.0 (Array format).

## [1.6.0] - 2026-02-15
### Added
- **New Onboarding UI**: Redesigned popup with a step-by-step guide for new users.
- **Web Monitor Link**: Quick access to v.knc.jp from the extension popup.

### Changed
- **Injection Engine**: Refactored text injection logic using `InputEvent` for high compatibility with Gmail, Gemini, and ChatGPT.
- **Security**: Hardened origin checks and removed unnecessary permissions.

## [1.5.0] - 2026-02-14
### Added
- **Multi-Domain Support**: Added support for both `v.knc.jp` (Zen mode) and `t.knc.jp` (Translate mode).
- **Domain Migration**: Migrated primary infrastructure to `knc.jp`.
