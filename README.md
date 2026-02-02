# VoiceMux Bridge 🛰️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**VoiceMux Bridge** is a Chrome extension that turns your smartphone into a secure, E2EE-encrypted remote keyboard for AI agents (Gemini, ChatGPT, Claude, etc.).

## 🔐 Security & Privacy (E2EE)
This extension features true Client-Side End-to-End Encryption (E2EE).
- **Local Key Generation**: Your encryption keys are generated locally within the extension and stored in `chrome.storage.local`.
- **Zero-Knowledge**: Keys are never transmitted to the server. They are shared with your mobile device via URL hash fragments (`#key=...`), which are not sent to the server by design.
- **Auditable**: All encryption and decryption logic is contained within `content.js` and `background.js` and is open for public audit.

## 🚀 How to Use
1. Install the extension.
2. Click the extension icon to reveal the pairing QR code.
3. Scan the QR code with your mobile device to establish a secure link.
4. Start typing or using voice-to-text on your phone; it will appear instantly on your PC.

## 🛠️ Custom Site Adapters
You can add support for any website by defining custom CSS selectors in the Extension Options page.
1. Right-click the VoiceMux icon and select **Options**.
2. Paste your custom JSON configuration.

## 📄 License
MIT License - see the [LICENSE](LICENSE) file for details.
