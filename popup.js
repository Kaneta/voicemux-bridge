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
    const data = await chrome.storage.local.get(['voicemux_room_id', 'voicemux_token', 'voicemux_key', 'voicemux_hub_url', 'voicemux_paired']);
    const roomId = data.voicemux_room_id;
    const token = data.voicemux_token;
    const keyBase64 = data.voicemux_key;
    const isPaired = data.voicemux_paired;
    
    let hubOrigin = 'https://hub.knc.jp';
    try {
      const rawHubUrl = data.voicemux_hub_url || 'https://hub.knc.jp';
      hubOrigin = new URL(rawHubUrl).origin;
    } catch (e) {}

    if (roomId && token && keyBase64) {
      // --- LINKED STATE (READY) ---
      linkedView.style.display = "flex";
      unlinkedView.style.display = "none";
      statusIndicator?.classList.add("online");

      // Check for active pairing success
      if (isPaired) {
        linkedView.innerHTML = `
          <div class="success-animation">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h2 class="ready-msg" style="color: #10b981;">Paired Successfully!</h2>
          <p class="sync-instruction">Your phone is now connected as a mic.</p>
          <button id="btn-close-popup" class="btn-tonal" style="width: 100%; margin-top: 12px; background-color: #10b981; color: white;">
            Done (Close)
          </button>
        `;
        const closeBtn = document.getElementById("btn-close-popup");
        if (closeBtn) closeBtn.onclick = () => window.close();
        return;
      }

      // Update Hub Link (Optional)
      if (hubLink) hubLink.href = `${hubOrigin}/welcome`;

      // Construct Pairing URL
      let pairingUrl = `${hubOrigin}/${roomId}`;
      pairingUrl += `?mode=zen&token=${token}`;
      pairingUrl += `#key=${keyBase64}`;
      
      const displayRoomId = roomId.substring(0, 4).toUpperCase();
      if (roomIdDisplay) roomIdDisplay.innerText = displayRoomId;
      if (qrcodeLink) qrcodeLink.href = pairingUrl;

      // Handle Copy Button
      const copyBtn = document.getElementById("copy-btn");
      const copyText = document.getElementById("copy-text");
      if (copyBtn) {
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(pairingUrl);
            if (copyText) copyText.innerText = chrome.i18n.getMessage("btn_copy_success");
            copyBtn.classList.add("success");
            setTimeout(() => {
              if (copyText) copyText.innerText = chrome.i18n.getMessage("btn_copy_link");
              copyBtn.classList.remove("success");
            }, 2000);
          } catch (err) {}
        };
      }

      // Generate QR Code
      if (qrcodeContainer && qrcodeContainer.innerHTML === "") {
        new QRCode(qrcodeContainer, {
          text: pairingUrl,
          width: 160,
          height: 160,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      }

    } else {
      // --- UNLINKED STATE ---
      unlinkedView.style.display = "flex";
      linkedView.style.display = "none";
      statusIndicator?.classList.remove("online");

      if (btnOpenHub) {
        btnOpenHub.onclick = () => {
          chrome.tabs.create({ url: hubOrigin });
        };
      }

      // Signal background to check connection
      chrome.runtime.sendMessage({ action: "check_connection" });
    }
  }

  // Initial update
  updateUI();
  
  // DESIGN INTENT: Reset pairing flag when opening to allow future re-pairs
  chrome.storage.local.set({ 'voicemux_paired': false });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.voicemux_room_id || changes.voicemux_token || changes.voicemux_paired)) {
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
