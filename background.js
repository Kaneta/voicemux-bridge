/**
 * VoiceMux Bridge: Extension Service Worker (WebSocket Relay)
 * Version: 2.2.31
 */

const BASE_WS_URL = "wss://v.knc.jp/socket/websocket";
const MAX_RETRY_DELAY = 30000;

let socket = null;
let heartbeatInterval = null;
let retryTimer = null;
let retryDelay = 1000;
let currentRoomId = null;
let isJoined = false; 
const JOIN_REF = "1"; 

/** @intent Synchronous Base64 conversion to prevent Promise leakage. */
function safeAtob(str) {
  if (!str) return "";
  try {
    // Handle URL-safe Base64 and legacy space-conversion issues
    return atob(str.replace(/-/g, "+").replace(/_/g, "/").replace(/ /g, "+"));
  } catch (e) {
    return "";
  }
}

/** @intent Robust AES-GCM decryption. */
async function decrypt(payload) {
  try {
    const data = await chrome.storage.local.get('voicemux_key');
    if (!data.voicemux_key) return "[No Key]";
    
    // Fix legacy space-to-plus issue
    const cleanKey = data.voicemux_key.replace(/ /g, '+');
    const localHint = cleanKey.substring(0, 4);
    if (payload.key_hint && payload.key_hint !== localHint) {
      console.warn(`VoiceMux: Key Mismatch! Received: ${payload.key_hint} | Local: ${localHint}`);
      return "[Key Mismatch]";
    }

    const rawKey = safeAtob(cleanKey);
    const key = await crypto.subtle.importKey("raw", Uint8Array.from(rawKey, c => c.charCodeAt(0)), { name: "AES-GCM" }, false, ["decrypt"]);
    const iv = Uint8Array.from(safeAtob(payload.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return "[Decryption Error]";
  }
}

async function connect() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
  const data = await chrome.storage.local.get(['voicemux_token', 'voicemux_room_id']);
  if (!data.voicemux_token || !data.voicemux_room_id) return;

  currentRoomId = data.voicemux_room_id;
  const topic = `room:${currentRoomId}`; 
  socket = new WebSocket(`${BASE_WS_URL}?vsn=2.0.0&token=${data.voicemux_token}`);

  socket.onopen = () => {
    console.log("VoiceMux: Socket established. Joining room...");
    isJoined = false;
    socket.send(JSON.stringify([JOIN_REF, JOIN_REF, topic, "phx_join", {}]));
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify([null, "heartbeat", "phoenix", "heartbeat", {}])); }, 30000);
  };

  socket.onmessage = async (event) => {
    const [joinRef, ref, msgTopic, eventName, payload] = JSON.parse(event.data);
    if (msgTopic !== topic) return;

    // DESIGN INTENT: Remote logging mirror for PC console debugging.
    chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "LOG", log_level: "info", message: `📡 [${eventName}] | Sender: ${payload?.sender_tab_id || 'system'}` }).catch(() => {});
    });

    if (eventName === "phx_reply" && payload?.status === "ok") {
      console.log("VoiceMux: Channel Joined Successfully.");
      isJoined = true;
      retryDelay = 1000; // Reset retry delay on success
      socket.send(JSON.stringify([JOIN_REF, "2", topic, "device_online", { sender_tab_id: "extension" }]));
    } else if (eventName === "phx_reply" && payload?.status === "error") {
      console.error("VoiceMux: Channel Join Error:", payload?.response);
      // [Intent: Auth Failure Recovery] If token is invalid, stop retrying and clear stale data.
      if (payload?.response === "unauthorized" || payload?.response === "invalid token") {
        console.warn("VoiceMux: Authentication failed. Clearing stale credentials.");
        chrome.storage.local.remove(['voicemux_token', 'voicemux_room_id']);
        if (socket) socket.close();
      }
    } else if (eventName === "update_text" || eventName === "confirm_send") {
      const plaintext = await decrypt(payload);
      chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => { if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: eventName, plaintext }).catch(() => {}); });
    } else if (eventName === "device_online" && payload.sender_tab_id !== "extension") {
      if (isJoined) {
        // DESIGN INTENT: Bidirectional handshake. Reply to mobile that PC is online.
        socket.send(JSON.stringify([JOIN_REF, "3", topic, "device_online", { sender_tab_id: "extension" }]));
      }
    } else if (eventName === "remote_command") {
      // DESIGN INTENT: Execute remote action (INSERT, NEWLINE, SUBMIT, CLEAR, LOG)
      const text = (payload.ciphertext && payload.iv) ? await decrypt(payload) : payload.text;
      
      // Explicit Background Log for debugging
      if (payload.action === 'LOG') {
        console.log(`[Remote LOG] ${text || payload.message}`);
      }

      chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => { 
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { ...payload, text }).catch(() => {}); 
      });
      // @intent Activity awareness. If we receive a command, we are online.
      if (isJoined && payload.action !== 'LOG') {
        socket.send(JSON.stringify([JOIN_REF, "4", topic, "device_online", { sender_tab_id: "extension" }]));
      }
    }
  };
  socket.onclose = () => { isJoined = false; scheduleReconnect(); };
  socket.onerror = () => socket.close();
}

function scheduleReconnect() { if (retryTimer) clearTimeout(retryTimer); retryTimer = setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY); }

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_AUTH") {
    // [Intent: Robust Synchronization] Handle both flat and nested payload structures.
    const data = request.payload || request;
    const rawKey = data.key || data.voicemux_key || "";
    const cleanKey = rawKey.replace(/ /g, "+");
    const token = data.token || data.voicemux_token;
    const roomId = data.uuid || data.roomId || data.voicemux_room_id;

    if (!token || !roomId) {
      console.error("VoiceMux: Received invalid SYNC_AUTH data:", data);
      sendResponse?.({ success: false, error: "Missing token or roomId" });
      return;
    }

    chrome.storage.local.set({ 
      'voicemux_token': token, 
      'voicemux_room_id': roomId, 
      'voicemux_key': cleanKey 
    }, () => { 
      console.log("VoiceMux: Credentials synchronized. Reconnecting...");
      if (socket) socket.close(); 
      connect(); 
      sendResponse?.({ success: true });
    });
    return true; // Keep channel open for async response
  }
});

connect();
