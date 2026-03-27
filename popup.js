document.addEventListener("DOMContentLoaded", async () => {
  localize();
  const t = (key) => {return chrome.i18n.getMessage(key) || "";};

  const versionDisplay = document.getElementById("version-display");
  const contentView = document.getElementById("content-view");
  const contentTitle = document.getElementById("content-title");
  const contentCopy = document.getElementById("content-copy");
  const primaryAction = document.getElementById("primary-action");
  const primaryActionSkeleton = document.getElementById("primary-action-skeleton");
  const primaryNote = document.getElementById("primary-note");
  const btnResetGlobal = document.getElementById("btn-global-reset");

  const MIN_LOADING_MS = 400;
  const MAX_AUTH_WAIT_MS = 2000;
  const loadStartedAt = Date.now();
  let hasResolvedInitialState = false;
  let maxWaitTimer = null;

  if (versionDisplay) {
    versionDisplay.innerText = `v${chrome.runtime.getManifest().version}`;
  }

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

  const handleReset = async () => {
    if (!confirm(chrome.i18n.getMessage("confirm_reset") || "Reset room?")) {
      return;
    }

    await chrome.runtime.sendMessage({ action: "RESET_ROOM" }).catch(() => {
      return chrome.storage.local.remove([
        "voicemux_room_id",
        "voicemux_token",
        "voicemux_key",
        "voicemux_paired",
        "voicemux_pairing_code",
        "voicemux_mobile_connected"
      ]);
    });

    renderLoading();
    hasResolvedInitialState = true;
    void updateUI({ forceResolve: true });
  };

  if (btnResetGlobal) {
    btnResetGlobal.onclick = handleReset;
  }

  function setButton(action) {
    if (!primaryAction || !primaryActionSkeleton) {
      return;
    }

    if (!action) {
      primaryAction.classList.add("is-hidden");
      primaryActionSkeleton.classList.remove("is-hidden");
      primaryAction.onclick = null;
      return;
    }

    primaryAction.classList.remove("is-hidden");
    primaryActionSkeleton.classList.add("is-hidden");
    primaryAction.textContent = action.label;
    primaryAction.onclick = action.onClick;
  }

  function renderLoading() {
    contentView?.classList.add("is-loading");
    contentView?.classList.add("is-action-only");
    if (contentTitle) {
      contentTitle.textContent = "";
    }
    if (contentCopy) {
      contentCopy.textContent = "";
      contentCopy.classList.add("is-hidden");
    }
    if (primaryNote) {
      primaryNote.textContent = "";
      primaryNote.classList.add("is-hidden");
    }
    if (btnResetGlobal) {
      btnResetGlobal.classList.add("is-hidden");
    }
    setButton(null);
  }

  function renderState({ title, copy, button, note, showReset }) {
    contentView?.classList.remove("is-loading");
    contentView?.classList.toggle("is-action-only", !title && !copy && !note);

    if (contentTitle) {
      contentTitle.textContent = title;
    }
    if (contentCopy) {
      contentCopy.textContent = copy;
      contentCopy.classList.toggle("is-hidden", !copy);
    }

    setButton(button);

    if (primaryNote) {
      if (note) {
        primaryNote.textContent = note;
        primaryNote.classList.remove("is-hidden");
      } else {
        primaryNote.textContent = "";
        primaryNote.classList.add("is-hidden");
      }
    }

    if (btnResetGlobal) {
      btnResetGlobal.classList.toggle("is-hidden", !showReset);
    }
  }

  /**
   * [Intent: Resolve Product-Neutral Pairing Surface]
   * Decoupled from VoiceMuxHub to support multiple target apps.
   */
  async function resolvePairOrigin() {
    const data = await chrome.storage.local.get(["voicemux_pair_url"]);
    try {
      return new URL(data.voicemux_pair_url || "https://pair.knc.jp").origin;
    } catch {
      return "https://pair.knc.jp";
    }
  }

  /**
   * [Intent: Resolve Static Work Surface]
   * Currently VoiceMuxHub remains the primary librarian/editor.
   */
  async function resolveHubOrigin() {
    const data = await chrome.storage.local.get(["voicemux_hub_url"]);
    try {
      return new URL(data.voicemux_hub_url || "https://hub.knc.jp").origin;
    } catch {
      return "https://hub.knc.jp";
    }
  }

  async function updateUI(options = {}) {
    const forceResolve = !!options.forceResolve;
    const data = await chrome.storage.local.get([
      "voicemux_room_id",
      "voicemux_token",
      "voicemux_key",
      "voicemux_hub_url",
      "voicemux_mobile_connected"
    ]);

    const roomId = data.voicemux_room_id;
    const token = data.voicemux_token;
    const keyBase64 = data.voicemux_key;
    const hasAuth = !!(roomId && token && keyBase64);

    if (!hasResolvedInitialState && !hasAuth && !forceResolve) {
      renderLoading();
      return;
    }

    const elapsed = Date.now() - loadStartedAt;
    const remainingMin = Math.max(0, MIN_LOADING_MS - elapsed);
    if (!hasResolvedInitialState && remainingMin > 0) {
      setTimeout(() => {
        hasResolvedInitialState = true;
        void updateUI({ forceResolve: true });
      }, remainingMin);
      return;
    }

    hasResolvedInitialState = true;
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }

    const hubOrigin = await resolveHubOrigin();
    const pairOrigin = await resolvePairOrigin();

    if (hasAuth) {
      renderState({
        title:
          t("mobile_ready_title") ||
          "You can input text into websites on this PC from your smartphone.",
        copy:
          t("mobile_ready_copy") ||
          "You can close this popup and keep using voice input. Open VoiceMuxHub only when you want to confirm the link, review text, or polish the result.",
        button: {
          label: t("btn_manage_librarian") || "Open VoiceMuxHub",
          onClick: () => {
            chrome.tabs.create({ url: `${hubOrigin}/review/${roomId}` });
          }
        },
        note: "",
        showReset: true
      });
      return;
    }

    renderState({
      title: "",
      copy: "",
      button: {
        label: t("btn_open_pair_surface") || "Connect Phone",
        onClick: () => {
          chrome.tabs.create({ url: `${pairOrigin}/hub` });
        }
      },
      note: "",
      showReset: false
    });
  }

  renderLoading();
  maxWaitTimer = setTimeout(() => {
    maxWaitTimer = null;
    hasResolvedInitialState = true;
    void updateUI({ forceResolve: true });
  }, MAX_AUTH_WAIT_MS);

  void updateUI();

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (
      namespace === "local" &&
      (changes.voicemux_room_id ||
        changes.voicemux_token ||
        changes.voicemux_key ||
        changes.voicemux_mobile_connected)
    ) {
      void updateUI({ forceResolve: hasResolvedInitialState });
    }
  });
});

function localize() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    const message = chrome.i18n.getMessage(key);
    if (!message) {
      return;
    }
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.placeholder = message;
    } else {
      element.innerHTML = message;
    }
  });

  const guideLink = document.getElementById("guide-link");
  if (guideLink) {
    guideLink.href = chrome.i18n.getMessage("url_guide");
  }
}
