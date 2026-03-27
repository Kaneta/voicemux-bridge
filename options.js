// VoiceMux Options JS
const textarea = document.getElementById("custom-adapters");
const pairUrlInput = document.getElementById("pair-url");
const hubUrlInput = document.getElementById("hub-url");
const saveBtn = document.getElementById("save");
const status = document.getElementById("status");
const t = (key, substitutions = []) => {
  return chrome.i18n.getMessage(key, substitutions) || "";
};

// Load saved settings
document.addEventListener("DOMContentLoaded", async () => {
  localize();
  const data = await chrome.storage.local.get([
    "custom_adapters",
    "voicemux_pair_url",
    "voicemux_hub_url"
  ]);

  if (data.custom_adapters) {
    textarea.value = JSON.stringify(data.custom_adapters, null, 2);
  }

  if (data.voicemux_pair_url) {
    pairUrlInput.value = data.voicemux_pair_url;
  }

  if (data.voicemux_hub_url) {
    hubUrlInput.value = data.voicemux_hub_url;
  }
});

// Save settings
saveBtn.addEventListener("click", async () => {
  const rawAdapters = textarea.value.trim();
  let parsedAdapters = [];

  if (rawAdapters) {
    try {
      parsedAdapters = JSON.parse(rawAdapters);
      if (!Array.isArray(parsedAdapters)) {
        throw new Error("Must be an array");
      }
    } catch (e) {
      alert(t("invalid_json_format", [e.message]));
      return;
    }
  }

  const pairUrl = pairUrlInput.value.trim();
  const hubUrl = hubUrlInput.value.trim();

  // Basic URL sanity check
  if (pairUrl && !isValidUrl(pairUrl)) {
    alert(t("options_pair_url_invalid") || "Invalid Pairing Surface URL");
    return;
  }
  if (hubUrl && !isValidUrl(hubUrl)) {
    alert(t("options_hub_url_invalid") || "Invalid VoiceMuxHub URL");
    return;
  }

  await chrome.storage.local.set({
    custom_adapters: parsedAdapters,
    voicemux_pair_url: pairUrl,
    voicemux_hub_url: hubUrl
  });

  // Show status
  status.style.display = "block";
  status.textContent = t("status_saved") || "Settings saved successfully";
  setTimeout(() => {
    status.style.display = "none";
  }, 2000);
});

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

function localize() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
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

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const key = element.getAttribute("data-i18n-title");
    const message = chrome.i18n.getMessage(key);
    if (message) {
      document.title = message;
    }
  });
}
