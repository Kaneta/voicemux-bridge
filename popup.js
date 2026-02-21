// VoiceMux Popup JS (v2.0 Clean Architecture)
document.addEventListener('DOMContentLoaded', async () => {
  const unlinkedView = document.getElementById("unlinked-view");
  const linkedView = document.getElementById("linked-view");
  const qrcodeContainer = document.getElementById("qrcode");
  const qrcodeLink = document.getElementById("qrcode-link");
  const roomIdDisplay = document.getElementById("room-id");
  const btnOpenHub = document.getElementById("btn-open-hub");

  // 1. Retrieve credentials from storage
  // Note: key names match background.js logic
  const data = await chrome.storage.local.get(['voicemux_room_id', 'voicemux_token', 'voicemux_key', 'voicemux_hub_url']);
  const roomId = data.voicemux_room_id;
  const token = data.voicemux_token;
  const keyBase64 = data.voicemux_key;
  const hubBaseUrl = data.voicemux_hub_url || 'https://hub.knc.jp';

  if (roomId && token && keyBase64) {
    // --- LINKED STATE ---
    linkedView.style.display = "block";
    unlinkedView.style.display = "none";

    // Construct Pairing URL
    let pairingUrl = `${hubBaseUrl}/${roomId}/zen`;
    pairingUrl += `?token=${token}&uuid=${roomId}`;
    pairingUrl += `#key=${keyBase64}`;
    
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
    // --- UNLINKED STATE ---
    unlinkedView.style.display = "flex";
    linkedView.style.display = "none";

    btnOpenHub.addEventListener("click", () => {
      chrome.tabs.create({ url: hubBaseUrl });
    });

    // Optional: Signal background to check if it's just a delay
    chrome.runtime.sendMessage({ action: "check_connection" });
  }
});
