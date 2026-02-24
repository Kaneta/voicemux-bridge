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
    const data = await chrome.storage.local.get('voicemux_key');
    if (!data.voicemux_key) {
      console.warn("[E2EE] Decryption skipped: No key in storage.");
      return payload.text || "";
    }

    const rawKey = Uint8Array.from(safeAtob(data.voicemux_key), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, ["decrypt"]);
    
    const iv = Uint8Array.from(safeAtob(payload.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), c => c.charCodeAt(0));
    
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const result = new TextDecoder().decode(decrypted);
    
    if (!result && ciphertext.length > 0) {
      console.warn("[E2EE] Decrypted to empty string. Possible key mismatch.");
    }
    return result;
  } catch (e) {
    console.error("[E2EE] Decryption failed. Error:", e.name, "| Key Length:", safeAtob((await chrome.storage.local.get('voicemux_key')).voicemux_key).length);
    return "[Decryption Error]";
  }
}

let currentRoomId = null;

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
  currentRoomId = roomId;

  try {
    const topic = `room:${roomId}`; 
    console.log(`VoiceMux: Connecting... | Room: ${roomId}`);
    
    const wsUrl = `${BASE_WS_URL}?vsn=2.0.0&token=${token}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      
      console.log("VoiceMux: Connected (Authenticated)");
      retryDelay = 1000;
      socket.send(JSON.stringify(["1", "1", topic, "phx_join", {}]));
      
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify([null, "heartbeat", "phoenix", "heartbeat", {}]));
        }
      }, 30000);
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      const msgTopic = data[2];
      const eventName = data[3];
      const payload = data[4];

      // DESIGN INTENT: Dynamic Topic Validation.
      // Use the currentRoomId from the top-level scope to ensure we match the right room.
      if (msgTopic === `room:${currentRoomId}`) {
        if (eventName === "update_text" || eventName === "confirm_send") {
          console.log(`VoiceMux: Data received [${eventName}]. Decrypting...`);
          
          // Verify Key Fingerprint
          const localKey = (await chrome.storage.local.get('voicemux_key')).voicemux_key;
          if (payload.key_hint && localKey && !localKey.startsWith(payload.key_hint)) {
            console.error(`VoiceMux: KEY MISMATCH! Sender Hint: ${payload.key_hint} | Local Hint: ${localKey.substring(0, 4)}`);
            return;
          }

          const plaintext = await decrypt(payload);
          
          if (plaintext === "[Decryption Error]") {
            console.error("VoiceMux: Decryption failed. Key might be out of sync.");
            return;
          }

          chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
            if (tabs[0]) {
               console.log("VoiceMux: Injecting text to tab:", tabs[0].title);
               chrome.tabs.sendMessage(tabs[0].id, {
                action: eventName,
                plaintext: plaintext 
              }).catch((err) => console.warn("VoiceMux: Tab injection failed:", err));
            } else {
              console.warn("VoiceMux: No active tab found for injection.");
            }
          });
        } else if (eventName === "device_online") {
          // DESIGN INTENT: Feedback loop.
          // Another device (the phone) just joined.
          console.log("VoiceMux: Remote device detected. Pairing successful!");
          chrome.storage.local.set({ 'voicemux_paired': true });
        } else if (eventName === "remote_command") {
          // DESIGN INTENT: Remote Control.
          // Phone sends commands like CLEAR, SUBMIT, INSERT, NEWLINE.
          console.log("VoiceMux: Remote command received:", payload.action);
          
          let textToForward = payload.text;
          // If encrypted, decrypt it. In Bolt protocol, text might be encrypted.
          if (payload.ciphertext && payload.iv) {
              decrypt(payload).then(decrypted => {
                  chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
                      if (tabs[0]) {
                         chrome.tabs.sendMessage(tabs[0].id, {
                          action: payload.action,
                          text: decrypted
                        }).catch(() => {});
                      }
                  });
              });
          } else {
              chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
                if (tabs[0]) {
                   chrome.tabs.sendMessage(tabs[0].id, {
                    action: payload.action,
                    text: textToForward
                  }).catch(() => {});
                }
              });
          }
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

let syncTimeout = null;

// ★ External Message Listener (Clean Sync architecture)
// DESIGN INTENT: Receive credentials directly from Hub's JS environment.
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_AUTH") {
    const { uuid, token, key } = request.payload;
    
    // DESIGN INTENT: Debounce rapid sync calls from Hub to prevent WebSocket thrashing.
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      console.log(`[Auth] Sync received from Hub. UUID: ${uuid.substring(0, 8)}...`);
      chrome.storage.local.set({
        'voicemux_room_id': uuid,
        'voicemux_token': token,
        'voicemux_key': key,
        'voicemux_hub_url': sender.url // Automatically trust the hub URL
      }, () => {
        // Force a clean reconnection with the new credentials
        if (socket) {
          socket.onclose = null; // Prevent reconnection loop during intentional close
          socket.onerror = null;
          socket.close();
          socket = null;
        }
        connect();
      });
    }, 500); // 500ms debounce

    if (sendResponse) sendResponse({ success: true });
    return true; 
  }
});

// Internal check connection (e.g. from popup)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "check_connection") {
    safeCheckConnection();
  }
});

// Start initial connection attempt
console.log(`VoiceMux Bridge v${chrome.runtime.getManifest().version} Background Service Worker Started`);
connect();
