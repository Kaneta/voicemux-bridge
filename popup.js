// VoiceMux Popup JS
document.addEventListener('DOMContentLoaded', async () => {
  const qrcodeContainer = document.getElementById("qrcode");
  const roomLink = document.getElementById("room-link");

  // Retrieve room ID and encryption key
  const data = await chrome.storage.local.get(['voicemux_room_id', 'voicemux_key']);
  const roomId = data.voicemux_room_id;
  const keyBase64 = data.voicemux_key;

  if (roomId && keyBase64) {
    // Construct E2EE Pairing URL (Key is in the hash fragment)
    const pairingUrl = `https://voice.kaneta.net/?room=${roomId}#key=${keyBase64}`;
    
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
