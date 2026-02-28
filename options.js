// VoiceMux Options JS
const textarea = document.getElementById("custom-adapters");
const saveBtn = document.getElementById("save");
const status = document.getElementById("status");

// Load saved settings
document.addEventListener("DOMContentLoaded", async () => {
  localize();
  const data = await chrome.storage.local.get("custom_adapters");
  if (data.custom_adapters) {
    textarea.value = JSON.stringify(data.custom_adapters, null, 2);
  }
});

// Save settings
saveBtn.addEventListener("click", async () => {
  const rawValue = textarea.value.trim();
  let parsedValue = [];

  if (rawValue) {
    try {
      parsedValue = JSON.parse(rawValue);
      if (!Array.isArray(parsedValue)) {throw new Error("Must be an array");}
    } catch (e) {
      alert(chrome.i18n.getMessage("invalid_json_format", [e.message]));
      return;
    }
  }

  await chrome.storage.local.set({ "custom_adapters": parsedValue });
  
  // Show status
  status.style.display = "block";
  setTimeout(() => {
    status.style.display = "none";
  }, 2000);
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

  document.querySelectorAll("[data-i18n-title]").forEach(element => {
    const key = element.getAttribute("data-i18n-title");
    const message = chrome.i18n.getMessage(key);
    if (message) {
      document.title = message;
    }
  });
}
