// VoiceMux Bridge: Background Service Worker (Clean Push-Sync Mode)
// Configuration
const IS_DEV = false; // Set to true for local backend testing
const BASE_WS_URL = IS_DEV ? "ws://localhost:4000/socket/websocket" : "wss://v.knc.jp/socket/websocket";
const HUB_URL = IS_DEV ? "http://localhost:5173" : "https://hub.knc.jp";

/**
 * decodes Base64 strings safely, supporting both Standard and URL-safe formats.
 */
function safeAtob(base64) {
  if (!base64) return "";
  let standardBase64 = base64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (standardBase64.length % 4 !== 0) {
    standardBase64 += '=';
  }
  try {
    return atob(standardBase64);
  } catch (e) {
    console.error("[Base64] atob failed:", e);
    return "";
  }
}

let socket = null;
let heartbeatInterval = null;
let retryTimer = null;
let retryDelay = 1000;
const MAX_RETRY_DELAY = 60000;

// ★ Crypto Helpers
async function getDecryptionKey() {
  const data = await chrome.storage.local.get('voicemux_key');
  if (!data.voicemux_key) return null;
  const rawKey = Uint8Array.from(safeAtob(data.voicemux_key), c => c.charCodeAt(0));
  return await crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, ["decrypt"]);
}

async function decrypt(payload) {
  if (!payload.ciphertext || !payload.iv) return payload.text || "";
  try {
    const key = await getDecryptionKey();
    if (!key) {
      console.warn("[E2EE] Decryption skipped: No key available.");
      return payload.text || "";
    }
    const iv = Uint8Array.from(safeAtob(payload.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("[E2EE] Decryption failed.", e);
    return "[Decryption Error]";
  }
}

/** Initializes WebSocket connection to the relay server using KNC ID token. */
async function connect() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }

  // DESIGN INTENT: Passive connection.
  // Wait for credentials to be pushed from Hub via SYNC_AUTH message.
  const data = await chrome.storage.local.get(['voicemux_token', 'voicemux_room_id']);
  
  if (!data.voicemux_token || !data.voicemux_room_id) {
    console.log("VoiceMux: Waiting for credentials from Hub...");
    return;
  }

  const roomId = data.voicemux_room_id;
  const token = data.voicemux_token;

  try {
    const currentTopic = `room:${roomId}`; 
    console.log(`VoiceMux: Connecting... | Room: ${roomId}`);
    
    const wsUrl = `${BASE_WS_URL}?vsn=2.0.0&token=${token}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("VoiceMux: Connected (Authenticated)");
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
          const plaintext = await decrypt(payload);
          chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
            if (tabs[0]) {
               chrome.tabs.sendMessage(tabs[0].id, {
                action: eventName,
                plaintext: plaintext 
              }).catch(() => {});
            }
          });
        } else if (eventName === "device_online") {
          // DESIGN INTENT: Feedback loop.
          // Another device (the phone) just joined.
          console.log("VoiceMux: Remote device detected. Pairing successful!");
          chrome.storage.local.set({ 'voicemux_paired': true });
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

function scheduleReconnect() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, retryDelay);
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
}

function cleanup() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = null;
}

function safeCheckConnection() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connect();
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    safeCheckConnection();
  }
});
chrome.alarms.create("keepAlive", { periodInMinutes: 1 });

// ★ External Message Listener (Clean Sync architecture)
// DESIGN INTENT: Receive credentials directly from Hub's JS environment.
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_AUTH") {
    const { uuid, token, key } = request.payload;
    
    console.log(`[Auth] Sync received from Hub. UUID: ${uuid.substring(0, 8)}... Token: ${token.substring(0, 10)}...`);
    chrome.storage.local.set({
      'voicemux_room_id': uuid,
      'voicemux_token': token,
      'voicemux_key': key,
      'voicemux_hub_url': sender.url // Automatically trust the hub URL
    }, () => {
      if (socket) socket.close();
      connect();
      if (sendResponse) sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }
});

// Internal check connection (e.g. from popup)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "check_connection") {
    safeCheckConnection();
  }
});

// Start initial connection attempt
connect();
