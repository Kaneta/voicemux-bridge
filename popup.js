// VoiceMux Popup JS
/**
 * 実装意図:
 * - Design Unification: サーバー側の M3 (Material Design 3) テーマと同期し、シームレスな UX を提供。
 * - UI Simplification: 非常に長いペアリングURLを隠し、Room ID のみを表示することで視認性を向上。
 * - Action Centralization: 「コピー」と「移動（QRクリック）」のアクションを明確に分離。
 */
document.addEventListener('DOMContentLoaded', async () => {
  const qrcodeContainer = document.getElementById("qrcode");
  const qrcodeLink = document.getElementById("qrcode-link");
  const roomIdDisplay = document.getElementById("room-id");

  // 1. Log context
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  console.log("VoiceMux Popup opened on:", tab?.url);

  // 2. Retrieve room ID, encryption key, and auth token from background storage
  const data = await chrome.storage.local.get(['voicemux_room_id', 'voicemux_key', 'voicemux_token']);
  const roomId = data.voicemux_room_id;
  const keyBase64 = data.voicemux_key;
  const token = data.voicemux_token;

  if (roomId && keyBase64) {
    // Construct E2EE Pairing URL (Points directly to ZenLive session)
    let pairingUrl = `https://v.knc.jp/z/${roomId}`;
    let queryParams = [];
    if (token) {
      queryParams.push(`token=${token}`);
    }
    if (queryParams.length > 0) {
      pairingUrl += `?${queryParams.join('&')}`;
    }
    pairingUrl += `#key=${keyBase64}`;
    
    // Display only the Room ID for clarity
    roomIdDisplay.innerText = `Room: ${roomId}`;
    qrcodeLink.href = pairingUrl;

    // Handle Copy Button
    const copyBtn = document.getElementById("copy-btn");
    const copyText = document.getElementById("copy-text");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pairingUrl);
        copyText.innerText = "Copied!";
        copyBtn.classList.add("success");
        setTimeout(() => {
          copyText.innerText = "Copy Link";
          copyBtn.classList.remove("success");
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    });

    // Generate QR Code
    new QRCode(qrcodeContainer, {
      text: pairingUrl,
      width: 200,
      height: 200,
      colorDark: "#1e293b",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  } else {
    roomIdDisplay.innerText = "Error: Room ID or Key not found. Please wait or reload.";
  }
});
