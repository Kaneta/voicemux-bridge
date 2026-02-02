// Configuration
const WS_URL = "wss://voice.kaneta.net/socket/websocket?vsn=2.0.0";

let socket = null;
let heartbeatInterval = null;
let retryTimer = null;
let retryDelay = 1000;
const MAX_RETRY_DELAY = 60000;

// ★ Room & Key Management
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

async function connect() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }

  const { roomId, keyBase64 } = await getOrCreateSecrets();
  const currentTopic = `voice_input:${roomId}`;

  console.log(`VoiceMux: Connecting... | Room: ${roomId}`);
  
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log("VoiceMux: Connected");
    console.log(`E2EE Pairing URL: https://voice.kaneta.net/?room=${roomId}#key=${keyBase64}`);

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
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
  };

  socket.onerror = (err) => {
    socket.close();
  };
}

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