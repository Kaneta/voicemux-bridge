// VoiceMux Popup JS (v2.1.0 Finalized UI)
document.addEventListener('DOMContentLoaded', async () => {
  // Localization
  localize();

  const unlinkedView = document.getElementById("unlinked-view");
  const linkedView = document.getElementById("linked-view");
  const qrcodeContainer = document.getElementById("qrcode");
  const qrcodeLink = document.getElementById("qrcode-link");
  const roomIdDisplay = document.getElementById("room-id");
  const btnOpenHub = document.getElementById("btn-open-hub");
  const statusIndicator = document.getElementById("status-indicator");
  const hubLink = document.getElementById("hub-link");

  // 1. Retrieve credentials from storage
  async function updateUI() {
    const data = await chrome.storage.local.get(['voicemux_room_id', 'voicemux_token', 'voicemux_key', 'voicemux_hub_url']);
    const roomId = data.voicemux_room_id;
    const token = data.voicemux_token;
    const keyBase64 = data.voicemux_key;
    
    let hubOrigin = 'https://hub.knc.jp';
    try {
      const rawHubUrl = data.voicemux_hub_url || 'https://hub.knc.jp';
      hubOrigin = new URL(rawHubUrl).origin;
    } catch (e) {}

    if (roomId && token && keyBase64) {
      // --- LINKED STATE (READY) ---
      linkedView.style.display = "flex";
      unlinkedView.style.display = "none";
      statusIndicator.classList.add("online");

      // Update Hub Link
      if (hubLink) hubLink.href = `${hubOrigin}/welcome`;

      // Construct Pairing URL
      let pairingUrl = `${hubOrigin}/${roomId}/zen`;
      pairingUrl += `?token=${token}&uuid=${roomId}`;
      pairingUrl += `#key=${keyBase64}`;
      
      roomIdDisplay.innerText = chrome.i18n.getMessage("room_label", [roomId]);
      qrcodeLink.href = pairingUrl;

      // Handle Copy Button
      const copyBtn = document.getElementById("copy-btn");
      const copyText = document.getElementById("copy-text");
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(pairingUrl);
          copyText.innerText = chrome.i18n.getMessage("btn_copy_success");
          copyBtn.classList.add("success");
          setTimeout(() => {
            copyText.innerText = chrome.i18n.getMessage("btn_copy_link");
            copyBtn.classList.remove("success");
          }, 2000);
        } catch (err) {}
      };

      // Generate QR Code
      if (qrcodeContainer.innerHTML === "") {
        new QRCode(qrcodeContainer, {
          text: pairingUrl,
          width: 160,
          height: 160,
          colorDark: "#6750A4",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }

    } else {
      // --- UNLINKED STATE ---
      unlinkedView.style.display = "flex";
      linkedView.style.display = "none";
      statusIndicator.classList.remove("online");

      btnOpenHub.onclick = () => {
        chrome.tabs.create({ url: hubOrigin });
      };

      // Signal background to check connection
      chrome.runtime.sendMessage({ action: "check_connection" });
    }
  }

  // Initial update
  updateUI();

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.voicemux_room_id || changes.voicemux_token)) {
      updateUI();
    }
  });
});

function localize() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.placeholder = message;
      } else {
        element.innerHTML = message;
      }
    }
  });

  // Localize specialized links
  const guideLink = document.getElementById('guide-link');
  if (guideLink) {
    guideLink.href = chrome.i18n.getMessage('url_guide');
  }
}
