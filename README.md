# VoiceMux Bridge 🛰️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**VoiceMux Bridge** is the open-source Chrome extension for the VoiceMux ecosystem. It turns your smartphone into a secure, E2EE-encrypted remote keyboard for AI agents (Gemini, ChatGPT, Claude, etc.).

## 🔐 Security & Privacy (E2EE)
This extension features true Client-Side End-to-End Encryption (E2EE).
- **Zero-Knowledge**: Your encryption keys (AES-GCM 256-bit) are generated locally and stored in `chrome.storage.local`. They never touch the server.
- **Hash-based Key Exchange**: Keys are shared with your mobile device via URL hash fragments (`#key=...`), which are handled exclusively by the browser and never transmitted over the network to the server.
- **Auditable**: All security logic is open for public audit in this repository.

## 🚀 Features
- **One-Tap Pairing**: Click the extension icon to show a QR code for instant, secure pairing.
- **Atomic Submit**: Bundles text injection and send actions to ensure reliability even on complex React-based SPAs.
- **Custom Site Adapters**: Add support for any website by defining your own CSS selectors in the Extension Options page.
- **Universal Compatibility**: Falls back to the active element if no specific site adapter matches.

## 🛠️ How to Install (Developer Mode)
1. Clone this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the `voicemux-bridge` folder.

## 📄 License
MIT License - see the [LICENSE](LICENSE) file for details.
