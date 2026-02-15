# Chrome Web Store Submission Details - VoiceMux Bridge v1.6.0

## 1. Store Listing: Summary (Max 132 chars)
Secure, E2EE voice input bridge for AI agents. Turn your smartphone into a remote mic for ChatGPT, Gemini, and more.

## 2. Store Listing: Description
VoiceMux Bridge connects your smartphone's familiar keyboard and voice input to your PC browser. Dictate long texts on your phone and watch them appear instantly at your cursor on any website.

Key Features:
- End-to-End Encryption (E2EE): Your voice and text remain private.
- Universal Input: Works on ChatGPT, Gemini, Claude, Gmail, and any web form.
- Easy Setup: Just scan a QR code to pair your devices.
- Open Source & Auditable: Verify our security logic on GitHub.

GitHub Repository: https://github.com/Kaneta/voicemux-bridge
Web Monitor: https://v.knc.jp

## 3. Store Listing: Category
Productivity

## 4. Store Listing: Support URL
https://github.com/Kaneta/voicemux-bridge/issues

## 5. Privacy: Privacy Policy URL
https://github.com/Kaneta/voicemux-bridge/blob/main/PRIVACY.md

## 6. Privacy: Single Purpose Description
The single purpose of this extension is to provide a secure voice input bridge that transfers text from a mobile device directly into the active input field of a desktop browser. It enables users to dictate long texts on their phones and have them instantly typed into any web interface on their PC.

## 7. Privacy: Permission Justification (activeTab)
Used to identify and securely access the active text input field on the site the user is currently viewing, allowing the extension to inject the text received from the paired mobile device.

## 8. Privacy: Permission Justification (storage)
Used to store the locally generated E2EE encryption keys and room IDs. These keys never leave the user's browser.

## 9. Privacy: Permission Justification (Host Permissions / <all_urls>)
Required to inject a content script into the website of the user's choice (e.g., ChatGPT, Gemini, Claude, or custom work tools). This allows the extension to detect the active input cursor and insert text on any website where the user needs voice-to-text functionality.
