// VoiceMux Bridge: Background Service Worker (Stateless Identity Mode)
// Configuration
const IS_DEV = true; // Set to true for local backend testing
const BASE_WS_URL = IS_DEV ? "ws://localhost:4000/socket/websocket" : "wss://v.knc.jp/socket/websocket";
const IDENTITY_URL = IS_DEV ? "http://localhost:4000/api/auth/issue" : "https://v.knc.jp/api/auth/issue";
const HUB_URL = IS_DEV ? "http://localhost:5173" : "https://hub.knc.jp";

/**
 * decodes Base64 strings safely, supporting both Standard and URL-safe formats.
 */
function safeAtob(base64) {
  if (!base64) return "";
  const standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  return atob(standardBase64);
}

let socket = null;
let heartbeatInterval = null;
let retryTimer = null;
let retryDelay = 1000;
const MAX_RETRY_DELAY = 60000;

// ★ Identity & Key Management
/** 
 * Ensures the extension has a valid KNC ID and E2EE key.
 * DESIGN INTENT: Silent onboarding via authoritative server.
 */
async function provisionIdentity() {
  const data = await chrome.storage.local.get(['voicemux_token', 'voicemux_room_id', 'voicemux_key']);
  
  // Save current hub configuration for popup.js
  await chrome.storage.local.set({ 'voicemux_hub_url': HUB_URL });

  // 1. Always ensure local E2EE key exists (Zero-Knowledge)
  // Even if identity is server-led, the encryption key remains client-side.
  if (!data.voicemux_key) {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const exportedKey = await crypto.subtle.exportKey("raw", key);
    const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
    await chrome.storage.local.set({ 'voicemux_key': keyBase64 });
  }

  // 2. If no token, fetch a formal guest identity from the authoritative server
  if (!data.voicemux_token || !data.voicemux_room_id) {
    console.log("VoiceMux: Provisioning new server-led KNC ID...");
    try {
      const res = await fetch(IDENTITY_URL, { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      
      const { uuid, token } = await res.json();
      await chrome.storage.local.set({
        'voicemux_room_id': uuid,
        'voicemux_token': token
      });
      return { uuid, token };
    } catch (e) {
      console.error("VoiceMux: Identity provisioning failed:", e);
      return null;
    }
  }

  return { uuid: data.voicemux_room_id, token: data.voicemux_token };
}

// ★ Crypto Helpers
/** Imports the raw AES-GCM decryption key from storage. */
async function getDecryptionKey() {
  const data = await chrome.storage.local.get('voicemux_key');
  if (!data.voicemux_key) return null;
  const rawKey = Uint8Array.from(safeAtob(data.voicemux_key), c => c.charCodeAt(0));
  return await crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, ["decrypt"]);
}

/** Decrypts the received payload (ciphertext/iv) and returns plaintext string. */
async function decrypt(payload) {
  if (!payload.ciphertext || !payload.iv) return payload.text || "";
  try {
    const key = await getDecryptionKey();
    if (!key) throw new Error("Key not found");
    const iv = Uint8Array.from(safeAtob(payload.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("[E2EE] Decryption failed:", e);
    return "[Decryption Error]";
  }
}

/** Initializes WebSocket connection to the relay server using KNC ID token. */
async function connect() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }

  // Ensure we have an identity before connecting
  const identity = await provisionIdentity();
  if (!identity) {
    console.warn("VoiceMux: No identity available. Retrying...");
    scheduleReconnect();
    return;
  }

  const { uuid: roomId, token } = identity;

  try {
    const currentTopic = `room:${roomId}`; 

    console.log(`VoiceMux: Connecting... | Room: ${roomId}`);
    
    // Construct WebSocket URL with stateless KNC ID token
    const wsUrl = `${BASE_WS_URL}?vsn=2.0.0&token=${token}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("VoiceMux: Connected (KNC ID Authenticated)");
      retryDelay = 1000;
      socket.send(JSON.stringify(["1", "1", currentTopic, "phx_join", {}]));
      
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify([null, "heartbeat", "phoenix", "heartbeat", {}]));
        }
      }, 30000);
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      const msgTopic = data[2];
      const eventName = data[3];
      const payload = data[4];

      if (msgTopic === currentTopic) {
        if (eventName === "update_text" || eventName === "confirm_send") {
          // Centralized Decryption: Background script handles E2EE
          const plaintext = await decrypt(payload);

          chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
            if (tabs[0]) {
               chrome.tabs.sendMessage(tabs[0].id, {
                action: eventName,
                plaintext: plaintext 
              }).catch(() => {});
            }
          });
        }
      }
    };

    socket.onclose = () => {
      cleanup();
      scheduleReconnect();
    };

    socket.onerror = (err) => {
      socket.close();
    };
  } catch (error) {
    console.error("VoiceMux: Connection failed:", error);
    scheduleReconnect();
  }
}

/** Schedules a reconnection attempt with exponential backoff. */
function scheduleReconnect() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, retryDelay);
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
}

/** Clears heartbeat intervals and timers to prevent memory leaks during disconnection. */
function cleanup() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = null;
}

/** Signals the background script to check or re-establish the WebSocket connection. */
function safeCheckConnection() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log("VoiceMux: Connection check triggered...");
    retryDelay = 1000; 
    if (retryTimer) clearTimeout(retryTimer);
    connect();
  }
}

// 1. Listen for alarms to keep the Service Worker alive
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    safeCheckConnection();
  }
});

// Create periodic alarm (every 1 minute)
chrome.alarms.create("keepAlive", { periodInMinutes: 1 });

// ★ Auth Sync Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sync_auth") {
    const { uuid, token, key } = request.payload;
    chrome.storage.local.get(['voicemux_token', 'voicemux_room_id', 'voicemux_key'], (data) => {
      // Reconnect only if something has actually changed
      const hasChanged = data.voicemux_token !== token || 
                         data.voicemux_room_id !== uuid || 
                         data.voicemux_key !== key;

      if (hasChanged) {
        console.log("[Auth] Session updated from Hub. Reconnecting...");
        chrome.storage.local.set({
          'voicemux_room_id': uuid,
          'voicemux_token': token,
          'voicemux_key': key
        }, () => {
          if (socket) socket.close();
          connect();
        });
      }
    });
  }

  if (request.action === "check_connection") {
    safeCheckConnection();
  }
});

// Start initial connection
connect();
