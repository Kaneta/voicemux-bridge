# Privacy Policy for VoiceMux Bridge

Last updated: 2026-02-02

## 1. Data Collection
VoiceMux Bridge does **not** collect, store, or transmit any personal data, keystrokes, or browsing history to our servers.

## 2. End-to-End Encryption (E2EE)
All data transmitted from your mobile device to this extension is encrypted using Client-Side AES-GCM (256-bit).
- **Decryption Keys**: These keys are generated locally within your browser and stored in `chrome.storage.local`.
- **Zero-Knowledge**: Keys are shared with your mobile device via URL hash fragments (`#key=...`). These fragments are handled exclusively by the browser and are never sent to any server by design.

## 3. Permissions
The extension requires the following permissions to function:
- **activeTab / scripting**: Used only to inject text into the input field of the website you are currently using, and only upon your explicit request via the paired mobile device.
- **storage**: Used to save your local configuration, including your unique Room ID, encryption key, and any Custom Site Adapters you define.

## 4. Third-Party Services
VoiceMux Bridge acts as a bridge between your mobile device and the AI services you choose to use (e.g., Gemini, ChatGPT). We do not control and are not responsible for the privacy practices of those third-party services.

## 5. Contact
If you have any questions about this Privacy Policy, please open an issue on our [GitHub repository](https://github.com/Kaneta/voicemux-bridge).
