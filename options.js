// VoiceMux Options JS
const textarea = document.getElementById('custom-adapters');
const saveBtn = document.getElementById('save');
const status = document.getElementById('status');

// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get('custom_adapters');
  if (data.custom_adapters) {
    textarea.value = JSON.stringify(data.custom_adapters, null, 2);
  }
});

// Save settings
saveBtn.addEventListener('click', async () => {
  const rawValue = textarea.value.trim();
  let parsedValue = [];

  if (rawValue) {
    try {
      parsedValue = JSON.parse(rawValue);
      if (!Array.isArray(parsedValue)) throw new Error("Must be an array");
    } catch (e) {
      alert("Invalid JSON format: " + e.message);
      return;
    }
  }

  await chrome.storage.local.set({ 'custom_adapters': parsedValue });
  
  // Show status
  status.style.display = 'block';
  setTimeout(() => {
    status.style.display = 'none';
  }, 2000);
});
