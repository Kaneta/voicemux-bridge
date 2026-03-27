# VoiceMux Bridge: E2EE Implementation Report

This report explains the current E2EE flow using short excerpts from the live codebase.

## 1. A Trusted First-Party Surface Syncs the Room Snapshot

Trusted first-party VoiceMux web surfaces can push the active room snapshot into the extension with Chrome's internal extension messaging API.

The public part you can audit in this repository is the allowlist in [`manifest.json`](../manifest.json):

```json
"externally_connectable": {
  "matches": [
    "https://hub.knc.jp/*",
    "https://pair.knc.jp/*",
    "http://localhost/*"
  ]
}
```

This is important for transparency:

- the extension does not issue rooms by itself
- the extension receives an explicit room snapshot
- the target Hub origin is part of that snapshot

## 2. The Extension Stores the Room Snapshot Locally

When the extension receives `SYNC_AUTH`, it stores the room token, room id, key, and trusted Hub origin in `chrome.storage.local`.

Source: [`voicemux-bridge/background.js`](../background.js)

```javascript
chrome.storage.local.set(
	{
		voicemux_token: data.token,
		voicemux_room_id: data.uuid,
		voicemux_key: cleanKey,
		voicemux_mobile_connected: false,
		voicemux_hub_url: data.hub_url || sender.url
	},
	() => {
		connect();
	}
);
```

This means the extension keeps only the minimum local state required to:

- reconnect to the relay room
- decrypt incoming payloads
- open the correct first-party Hub surface when requested

## 3. Decryption Happens Inside the Background Worker

The relay sends encrypted blobs. The extension imports the local key and decrypts the payload with Web Crypto.

Source: [`voicemux-bridge/background.js`](../background.js)

```javascript
const data = await chrome.storage.local.get("voicemux_key");
const keyBase64 = data.voicemux_key;
…
const key = await crypto.subtle.importKey(
	"raw",
	Uint8Array.from(rawKey, (c) => {
		return c.charCodeAt(0);
	}),
	{ name: "AES-GCM" },
	false,
	["decrypt"]
);
…
const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
return new TextDecoder().decode(decrypted);
```

The relay does not see the plaintext at this stage. The key stays local to the client.

## 4. The Content Script Receives Plaintext Only After Local Decryption

After decryption, the extension forwards plaintext commands to the active tab.

Source: [`voicemux-bridge/content.js`](../content.js)

```javascript
const action = request.action || request.command;
let data = "";
if (request.plaintext) { data = request.plaintext; }
…
if (action === "INTERIM") {
	document.execCommand("insertText", false, data);
} else if (action === "INSERT") {
	document.execCommand("insertText", false, data);
}
```

The content script injects the already decrypted text. It does not obtain the encryption key from the relay.

## 5. What The Server Can And Cannot See

The relay at `v.knc.jp` can see:

- room join attempts
- encrypted transport payloads
- room lifecycle events such as reset

The relay cannot see:

- the E2EE key
- plaintext dictated text
- plaintext text injected into websites on your PC

## 6. Why This Is Auditable

VoiceMux Bridge is open source and not obfuscated. Anyone can inspect:

- which web origins are allowed to sync state into the extension
- how local key storage works
- where decryption happens
- where plaintext is finally injected

That transparency is the core of the security model.

---
Updated for the `2.2.x` public release line.
