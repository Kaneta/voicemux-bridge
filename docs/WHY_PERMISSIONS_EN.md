# Transparency Report: Why VoiceMux Bridge Requests "Access to All Sites"

**VoiceMux Bridge** is designed to provide a seamless bridge between your smartphone's voice recognition and your desktop browser. This document explains our technical decisions regarding Chrome Extension permissions and our commitment to user privacy.

---

## 1. Why does Chrome say this extension is "Not Trusted"?

### The Issue
When installing from the Chrome Web Store, you might see this message:

> **Warning:** This extension is not trusted by Enhanced Safe Browsing.

### The Reason
This is not due to a bug or malware. It is a standard automated security check by Google based on:

- **Developer Longevity:** The developer account is relatively new.
- **User Base:** The extension was recently published and has a growing but still small number of users.

**Our Commitment:**
VoiceMux Bridge is fully open-source. We provide the source code on GitHub for public auditing to ensure complete transparency while Google's automated trust score accumulates.

---

## 2. Why "Read and Change All Your Data on All Websites"?

### The Reason: Ensuring a "Frictionless" UX
The core value of VoiceMux is the **"Magic Experience"**—speak into your phone, and text appears on your PC instantly without you having to touch your mouse.

To achieve this, the extension must be able to:

1. **Standby:** Listen for incoming encrypted data regardless of which tab (ChatGPT, Gemini, Notion, etc.) you are currently using.
2. **Auto-Injection:** Detect the active input field as soon as you switch tabs and inject the text without manual intervention.

If we restricted permissions to "activeTab" (only when clicked), **you would have to click the extension icon every single time you switch a tab.** This would destroy the hands-free utility that makes VoiceMux valuable.

---

## 3. Privacy and Security by Design

We understand that "All Site Access" is a powerful permission. We balance this responsibility with the following transparency measures:

- **Open Source Client:** The Chrome extension source is public. Anyone can inspect how room auth is stored, how relay traffic is decrypted, and how text is injected into the active page.
- **Trusted First-Party Sync Only:** The extension accepts `SYNC_AUTH` only from trusted first-party origins declared in `manifest.json`, with production pairing on `pair.knc.jp` and review/polish flows on `hub.knc.jp`.
- **End-to-End Encryption (E2EE):** The relay only transports encrypted payloads. Decryption happens locally inside the extension background worker, not on the server.
- **No alarms permission:** Recovery after worker wake, startup, and install/update is handled with the standard service worker lifecycle and local reconnect rules, without requesting `alarms`.
- **Zero-Knowledge Key Exchange:** The encryption key reaches the mobile device via URL hash fragments (`#key=...`), which are not sent to the server.
- **On-Device Local Storage:** Room credentials, settings, and adapters are stored in `chrome.storage.local`, which is local storage inside this device's Chrome profile. We do not run remote code or browser-history analytics from the extension.

---

## 4. Industry Standards

Most essential productivity tools, such as **1Password, Grammarly, and DeepL**, require the same level of permission. Because these tools must be ready to assist you the moment you start typing, constant presence is a technical necessity.

---

## Conclusion

We chose this permission model to deliver the **fastest, most seamless input experience possible.** While the system warning looks intimidating, we stand behind our transparent, E2EE-secured architecture to earn your trust.

---
*Last Updated: 2026-03-27*
