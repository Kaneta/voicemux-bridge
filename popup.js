// VoiceMux Popup JS
document.addEventListener('DOMContentLoaded', async () => {
  const qrcodeContainer = document.getElementById("qrcode");
  const roomLink = document.getElementById("room-link");

  // Retrieve room ID, encryption key, and auth token
  const data = await chrome.storage.local.get(['voicemux_room_id', 'voicemux_key', 'voicemux_token']);
  const roomId = data.voicemux_room_id;
  const keyBase64 = data.voicemux_key;
  const token = data.voicemux_token;

  if (roomId && keyBase64) {
    // Construct E2EE Pairing URL (Key is in the hash fragment)
    let pairingUrl = `https://voice.kaneta.net/?room=${roomId}`;
    if (token) {
      pairingUrl += `&token=${token}`;
    }
    pairingUrl += `#key=${keyBase64}`;
    
    roomLink.innerText = pairingUrl;
    roomLink.href = pairingUrl;

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
    roomLink.innerText = "Error: Room ID or Key not found. Please reload the extension.";
  }
});
