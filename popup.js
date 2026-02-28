// VoiceMux Popup JS (v2.1.1 Finalized UI)
// [Intent: Chrome 拡張機能を「状態監視ツール」へと純化させ、UIロジック（QR生成/成功アニメーション等）をHubに集約することで、審査の不確実性と保守コストを最小化する。]
document.addEventListener("DOMContentLoaded", async () => {
  // Localization
  localize();

  // Version Display
  const versionDisplay = document.getElementById("version-display");
  if (versionDisplay) {
    versionDisplay.innerText = `v${chrome.runtime.getManifest().version}`;
  }

    const unlinkedView = document.getElementById("unlinked-view");
    const linkedView = document.getElementById("linked-view");
  
    // System Status Check (Non-blocking)
    try {
      const statusRes = await fetch("https://v.knc.jp/api/status");
      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status.is_maintenance) {
          const notice = document.getElementById("maintenance-notice");
          const link = document.getElementById("maintenance-link");
          if (notice && link) {
            notice.style.display = "block";
            link.href = status.info_url;
          }
        }
      }
    } catch (e) {
      console.warn("VoiceMux: Failed to fetch system status.", e);
    }
  
      const qrcodeLink = document.getElementById("qrcode-link");
    const roomIdDisplay = document.getElementById("room-id");
    const btnOpenHub = document.getElementById("btn-open-hub");
    const statusIndicator = document.getElementById("status-indicator");
    const hubLink = document.getElementById("hub-link");
    const phoneStatusText = document.getElementById("phone-status-text");

    // Global Reset Connection Logic
    const handleReset = async () => {
        if (confirm(chrome.i18n.getMessage("confirm_reset") || "Reset connection?")) {
            await chrome.storage.local.remove(["voicemux_room_id", "voicemux_token", "voicemux_key", "voicemux_paired"]);
            chrome.runtime.sendMessage({ action: "check_connection" });
            const data = await chrome.storage.local.get(["voicemux_hub_url"]);
            let hubOrigin = "https://hub.knc.jp";
            if (data.voicemux_hub_url) {
              hubOrigin = new URL(data.voicemux_hub_url).origin;
            }
            chrome.tabs.create({ url: `${hubOrigin}?action=reset` });
            window.close();
        }
    };

    const btnResetGlobal = document.getElementById("btn-global-reset");
    if (btnResetGlobal) {btnResetGlobal.onclick = handleReset;}

    // 1. Retrieve credentials from storage
    // [Intent: ストレージの変更（Hub側からのSYNC_AUTHメッセージによってトリガーされる）を監視し、リアクティブにUIを更新する。]
    async function updateUI() {
        const data = await chrome.storage.local.get(["voicemux_room_id", "voicemux_token", "voicemux_key", "voicemux_hub_url", "voicemux_paired"]);
        const roomId = data.voicemux_room_id;
        const token = data.voicemux_token;
        const keyBase64 = data.voicemux_key;
        const isPaired = data.voicemux_paired;
        
        let hubOrigin = "https://hub.knc.jp";
        try {
            const rawHubUrl = data.voicemux_hub_url || "https://hub.knc.jp";
            hubOrigin = new URL(rawHubUrl).origin;
        } catch (e) {
          console.warn("VoiceMux: Invalid hub URL in storage.", e);
        }

        if (roomId && token && keyBase64) {
            // --- LINKED STATE (READY) ---
            linkedView.style.display = "flex";
            unlinkedView.style.display = "none";
            statusIndicator?.classList.add("online");

            // Update Phone Status Text
            // [Intent: 成功アニメーションをHubに譲り、拡張機能側はステータスの文字色とテキスト変更のみを行うことでUIロジックを極小化。]
            if (phoneStatusText) {
                if (isPaired) {
                    phoneStatusText.innerText = "Connected";
                    phoneStatusText.className = "status-value connected";
                } else {
                    phoneStatusText.innerText = "Waiting...";
                    phoneStatusText.className = "status-value";
                }
            }

            // Update Hub Link (Optional)
            if (hubLink) {hubLink.href = `${hubOrigin}/welcome`;}

            const btnReset = document.getElementById("btn-reset-connection");
            if (btnReset) {btnReset.onclick = handleReset;}

            // Construct Pairing URL (Pointing to the dedicated Hub QR page)
            // [Intent: UI is now fully centralized on hub.knc.jp/qr]
            let pairingUrl = `${hubOrigin}/qr`;
            
            const displayRoomId = roomId.substring(0, 4).toUpperCase();
            if (roomIdDisplay) {roomIdDisplay.innerText = displayRoomId;}
            if (qrcodeLink) {qrcodeLink.href = pairingUrl;}

            // Handle Copy Button
            const copyBtn = document.getElementById("copy-btn");
            const copyText = document.getElementById("copy-text");
            if (copyBtn) {
                copyBtn.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(pairingUrl);
                        if (copyText) {copyText.innerText = chrome.i18n.getMessage("btn_copy_success");}
                        copyBtn.classList.add("success");
                        setTimeout(() => {
                            if (copyText) {copyText.innerText = chrome.i18n.getMessage("btn_copy_link");}
                            copyBtn.classList.remove("success");
                        }, 2000);
                    } catch (err) {
                      console.error("VoiceMux: Failed to copy URL.", err);
                    }
                };
            }
        } else {
      // --- UNLINKED STATE ---
      unlinkedView.style.display = "flex";
      linkedView.style.display = "none";
      statusIndicator?.classList.remove("online");

      if (btnOpenHub) {
        btnOpenHub.onclick = () => {
          chrome.tabs.create({ url: hubOrigin + "/qr" });
        };
      }

      // Signal background to check connection
      chrome.runtime.sendMessage({ action: "check_connection" });
    }
  }

  // Initial update
  updateUI();
  
  // DESIGN INTENT: Reset pairing flag when opening to allow future re-pairs
  chrome.storage.local.set({ "voicemux_paired": false });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && (changes.voicemux_room_id || changes.voicemux_token || changes.voicemux_paired)) {
      updateUI();
    }
  });
});

function localize() {
  document.querySelectorAll("[data-i18n]").forEach(element => {
    const key = element.getAttribute("data-i18n");
    const message = chrome.i18n.getMessage(key);
    if (message) {
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.placeholder = message;
      } else {
        element.innerHTML = message;
      }
    }
  });

  // Localize specialized links
  const guideLink = document.getElementById("guide-link");
  if (guideLink) {
    guideLink.href = chrome.i18n.getMessage("url_guide");
  }
}
