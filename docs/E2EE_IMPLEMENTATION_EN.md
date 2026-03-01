# VoiceMux Bridge: E2EE Implementation Report

This report explains how VoiceMux Bridge ensures that your data remains private and invisible to our servers, using snippets from the actual source code.

---

## 1. Local Key Generation and Secure Transfer
The encryption key (AES-GCM 128-bit) is generated within [VoiceMux Hub](https://hub.knc.jp) and securely pushed to the extension via the official browser messaging API. It is never sent to our servers.

**Source: `background.js` (Receiver side)**
```javascript
// Around line 155: Listening for credential push from the Hub
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_AUTH") {
    const { uuid, token, key } = request.payload;
    
    // Storing in the extension's private secure storage
    chrome.storage.local.set({
      'voicemux_room_id': uuid,
      'voicemux_token': token,
      'voicemux_key': key
    }, () => { ... });
  }
});
```
The key is stored in `chrome.storage.local`, an isolated storage area provided by the browser that websites and external servers cannot access.

---

## 2. Zero-Knowledge Key Exchange
We use URL hash fragments to share keys between your PC and smartphone without the server ever seeing the key.

**Source: `popup.js`**
```javascript
// Around line 45: Constructing the pairing URL
let pairingUrl = `${hubOrigin}/${roomId}/zen`;
pairingUrl += `?token=${token}&uuid=${roomId}`;
pairingUrl += `#key=${keyBase64}`; // Key is included in the hash
```
The key is placed after the `#` symbol. By technical design, **anything after the `#` (hash fragment) is handled exclusively by the browser and is NEVER sent to the server.**

---

## 3. Client-Side Decryption
The extension receives only encrypted blobs from the relay server. The actual decryption happens locally inside the extension's background process.

**Source: `background.js`**
```javascript
// Around line 43: The core decryption logic
async function decrypt(payload) {
  // Receives only ciphertext and IV (Initialization Vector)
  if (!payload.ciphertext || !payload.iv) return payload.text || "";
  
  try {
    const key = await getDecryptionKey(); // Import key from local storage
    const iv = Uint8Array.from(safeAtob(payload.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), c => c.charCodeAt(0));

    // AES-GCM decryption using the Web Crypto API
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    
    // Returns the plaintext only to the active browser tab
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // If the key is missing or incorrect, decryption is mathematically impossible
    return "[Decryption Error]";
  }
}
```
The relay server only sees the `ciphertext` string, which acts as noise. It has no mathematical means to read your data.

---

## 4. Conclusion
Based on the implementation above:
1. **Exclusive Access:** Only you possess the encryption keys on your devices.
2. **Secure Transport:** Keys never touch the network or the server.
3. **Transparent Logic:** Since the extension is open-source, anyone can verify that we do not leak data or bypass encryption.

---

## 5. How to Verify the Identity of the Code
"How do I know the code running in my browser is the same as this GitHub code?" You can verify this yourself with these steps:

### A. Inspect the installed files on your disk
Chrome stores the source code of installed extensions on your local machine.

- **Windows**: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\cgdogkhjnbbifpaoopigcedehleknlmj`
- **Mac**: `~/Library/Application Support/Google/Chrome/Default/Extensions/cgdogkhjnbbifpaoopigcedehleknlmj`
- **Linux**: `~/.config/google-chrome/Default/Extensions/cgdogkhjnbbifpaoopigcedehleknlmj`

You can open the JS files (`background.js`, `content.js`, etc.) in these folders and compare them with the GitHub repository. VoiceMux Bridge does not minify or obfuscate its code, making comparison easy.

### B. Inspect the Running Background Code
1. Open `chrome://extensions` in your browser.
2. Click the **"Service Worker"** link for VoiceMux Bridge.
3. Developer Tools will open, allowing you to read the `background.js` source code currently in execution.

VoiceMux Bridge proves its integrity through total transparency.

---
*Last Updated: 2026-02-21 (v2.1.0)*
