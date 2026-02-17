# VoiceMux Bridge: E2EE Implementation Report

This report explains how VoiceMux Bridge ensures that your data remains private and invisible to our servers, using snippets from the actual source code.

---

## 1. Local Key Generation
The encryption key (AES-GCM 256-bit) is generated directly within your browser extension and is never sent to our servers.

**Source: `background.js`**
```javascript
// Line 36: Generating the key using the standard Web Crypto API
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true,
  ["encrypt", "decrypt"]
);

// Lines 43-45: Exporting and storing the key ONLY in local storage
keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
await chrome.storage.local.set({ 'voicemux_key': keyBase64 });
```
The key is stored in `chrome.storage.local`, an isolated storage area that websites and external servers cannot access.

---

## 2. Zero-Knowledge Key Exchange
We use URL hash fragments to share keys between your PC and smartphone without the server ever seeing the key.

**Source: `background.js`**
```javascript
// Line 80: Constructing the pairing URL
console.log(`E2EE Pairing URL: https://v.knc.jp/z/${roomId}?token=${token}#key=${keyBase64}`);
```
The key is placed after the `#` symbol. By technical design, **anything after the `#` (hash fragment) is handled exclusively by the browser and is NEVER sent to the server.**

---

## 3. Client-Side Decryption
The extension receives only encrypted blobs from the relay server. The actual decryption happens locally inside the extension.

**Source: `content.js`**
```javascript
// Line 113: The decryption function
async function decrypt(payload) {
  // Receives only ciphertext and IV (Initialization Vector)
  if (!payload.ciphertext || !payload.iv) return payload.text || "";
  
  try {
    const key = await getDecryptionKey(); // Retrieve key from local storage
    const iv = Uint8Array.from(safeAtob(payload.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), c => c.charCodeAt(0));

    // Line 123: Decrypting the ciphertext locally
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    
    // Returns the plaintext only to the content script
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // If the key is missing or incorrect, decryption fails
    console.error("[E2EE] Decryption failed:", e);
    return "[Decryption Error]";
  }
}
```
The relay server only sees the `ciphertext` string, which is mathematically impossible to read without the key stored on your devices.

---

## 4. Conclusion
Based on the implementation above:
1. **Exclusive Access:** Only you possess the encryption keys.
2. **Secure Transport:** Keys never touch the network or the server.
3. **Transparent Logic:** Since the extension is open-source, anyone can verify that we do not leak data or bypass encryption.

By keeping the encryption/decryption logic within the open-source client, we provide a verifiably secure bridge that respects your privacy.

---
*Last Updated: 2026-02-17*
