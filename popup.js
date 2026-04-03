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

  const MIN_LOADING_MS = 400;
  const MAX_AUTH_WAIT_MS = 2000;
  const loadStartedAt = Date.now();
  let hasResolvedInitialState = false;
  let maxWaitTimer = null;
  let prewarmRequested = false;

  if (versionDisplay) {
    versionDisplay.innerText = `v${getPublicVersion(chrome.runtime.getManifest())}`;
  }

  void fetch("https://v.knc.jp/api/status")
    .then((statusRes) => {
      if (!statusRes.ok) {
        return null;
      }
      return statusRes.json();
    })
    .then((status) => {
      if (!status?.is_maintenance) {
        return;
      }
      const notice = document.getElementById("maintenance-notice");
      const link = document.getElementById("maintenance-link");
      if (notice && link) {
        notice.style.display = "block";
        link.href = status.info_url;
      }
    })
    .catch((e) => {
      console.warn("VoiceMux: Failed to fetch system status.", e);
    });

  function setButton(action, options = {}) {
    const showSkeleton = !!options.showSkeleton;
    if (!primaryAction || !primaryActionSkeleton) {
      return;
    }

    if (!action) {
      primaryAction.classList.add("is-hidden");
      primaryActionSkeleton.classList.toggle("is-hidden", !showSkeleton);
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
    setButton(null, { showSkeleton: true });
  }

  function renderState({ title, copy, button, note }) {
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
  }

  async function updateUI(options = {}) {
    const forceResolve = !!options.forceResolve;
    const data = await chrome.storage.local.get([
      "voicemux_room_id",
      "voicemux_token",
      "voicemux_key",
      "voicemux_mobile_connected"
    ]);

    const roomId = data.voicemux_room_id;
    const token = data.voicemux_token;
    const keyBase64 = data.voicemux_key;
    const isMobileConnected = !!data.voicemux_mobile_connected;
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

    const openPairSurface = async () => {
      try {
        await chrome.runtime.sendMessage({ action: "OPEN_PAIR_SURFACE" });
      } catch {
        /* launcher failure stays silent in popup */
      }
    };

    const connectAction = {
      label: t("btn_open_pair_surface") || "Connect Phone",
      onClick: openPairSurface
    };

    const showQrAction = {
      label: t("btn_show_qr") || "Review phone connection",
      onClick: openPairSurface
    };

    if (hasAuth) {
      renderState({
        title:
          t("mobile_ready_title") ||
          "Use phone input on this PC",
        copy: t("mobile_ready_copy"),
        button: showQrAction,
        note:
          (isMobileConnected
            ? t("mobile_connected_note")
            : t("mobile_connecting_note")) || ""
      });
      return;
    }

    if (!prewarmRequested) {
      prewarmRequested = true;
      chrome.runtime.sendMessage({ action: "PREWARM_PAIR_AUTH" }).catch(() => {
        /* best-effort prewarm */
      });
    }

    renderState({
      title:
        t("mobile_ready_title") ||
        "Use phone input on this PC",
      copy: "",
      button: connectAction,
      note: "",
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

function getPublicVersion(manifest) {
  const publicVersion = manifest?.version?.trim();
  if (publicVersion) {
    return publicVersion;
  }

  const versionName = manifest?.version_name?.trim();
  if (!versionName) {
    return "unknown";
  }

  return versionName.split("(")[0].trim() || versionName;
}

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
