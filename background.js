// Configuration
const BASE_WS_URL = "wss://voice.kaneta.net/socket/websocket";
const AUTH_URL = "https://voice.kaneta.net/api/auth";

let socket = null;
let heartbeatInterval = null;
let retryTimer = null;
let retryDelay = 1000;
const MAX_RETRY_DELAY = 60000;

// ★ Room & Key Management
/** Retrieves or generates E2EE Room ID and AES-GCM key from local storage. */
async function getOrCreateSecrets() {
  const data = await chrome.storage.local.get(['voicemux_room_id', 'voicemux_key']);
  
  let roomId = data.voicemux_room_id;
  let keyBase64 = data.voicemux_key;

  if (!roomId) {
    roomId = crypto.randomUUID();
    await chrome.storage.local.set({ 'voicemux_room_id': roomId });
  }

  if (!keyBase64) {
    // Generate a new AES-GCM key
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const exportedKey = await crypto.subtle.exportKey("raw", key);
    keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
    await chrome.storage.local.set({ 'voicemux_key': keyBase64 });
  }

  return { roomId, keyBase64 };
}

/** Fetches a connection token from the server. */
async function fetchToken(roomId) {
  const response = await fetch(`${AUTH_URL}?room=${roomId}`);
  if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
  const data = await response.json();
  await chrome.storage.local.set({ 'voicemux_token': data.token });
  return data.token;
}

/** Initializes WebSocket connection to the relay server and sets up heartbeat/reconnection logic. */
async function connect() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    const { roomId, keyBase64 } = await getOrCreateSecrets();
    const token = await fetchToken(roomId);
    const currentTopic = `voice_input:${roomId}`;

    console.log(`VoiceMux: Connecting... | Room: ${roomId}`);
    
    // Construct WebSocket URL with parameters (token is now mandatory)
    const wsUrl = `${BASE_WS_URL}?vsn=2.0.0&room=${roomId}&token=${token}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("VoiceMux: Connected (Secure)");
      console.log(`E2EE Pairing URL: https://voice.kaneta.net/?room=${roomId}&token=${token}#key=${keyBase64}`);

      retryDelay = 1000;
      socket.send(JSON.stringify(["1", "1", currentTopic, "phx_join", {}]));
      
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify([null, "heartbeat", "phoenix", "heartbeat", {}]));
        }
      }, 30000);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const msgTopic = data[2];
      const eventName = data[3];
      const payload = data[4];

      if (msgTopic === currentTopic) {
        if (eventName === "update_text" || eventName === "confirm_send") {
          chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
            if (tabs[0]) {
               chrome.tabs.sendMessage(tabs[0].id, {
                action: eventName,
                payload: payload // 暗号化されたデータ（ciphertext, iv等）を丸ごと送る
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "check_connection") {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      retryDelay = 1000; 
      if (retryTimer) clearTimeout(retryTimer);
      connect();
    }
  }
});

connect();