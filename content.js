// VoiceMux Bridge Content Script v2.5 (External JSON Adapters)
console.log("VoiceMux Bridge v2.5 Loaded");

let ADAPTERS_CACHE = [];

// ★ Initialize Adapters
async function loadAdapters() {
  try {
    // 1. Fetch Built-in Adapters
    const builtInUrl = chrome.runtime.getURL('adapters.json');
    const builtInRes = await fetch(builtInUrl);
    const builtInAdapters = await builtInRes.json();

    // 2. Fetch Custom Adapters from storage
    const storage = await chrome.storage.local.get('custom_adapters');
    const customAdapters = storage.custom_adapters || [];

    // 3. Normalize & Merge (Custom takes precedence)
    const normalizedCustom = customAdapters.map(a => ({
      name: a.name || "Custom",
      host: a.host,
      inputSelector: a.inputSelector ?? (Array.isArray(a.selectors) ? a.selectors.join(',') : a.selectors),
      submitSelector: a.submitSelector ?? (Array.isArray(a.sendBtns) ? a.sendBtns.join(',') : a.sendBtns)
    }));

    ADAPTERS_CACHE = [...normalizedCustom, ...builtInAdapters];
    console.log("VoiceMux: Adapters loaded", ADAPTERS_CACHE);

  } catch (e) {
    console.error("VoiceMux: Failed to load adapters", e);
    // Continue with empty cache, relying on fallback
  }
}

// Start loading immediately
loadAdapters();

// ★ Target Selection
async function getTargetAndAdapter() {
  const url = window.location.href;
  
  // Wait for adapters if not loaded (rare case, but safe)
  if (ADAPTERS_CACHE.length === 0) await loadAdapters();

  // 1. Try to find a matching adapter
  for (const adapter of ADAPTERS_CACHE) {
    if (adapter.host && url.includes(adapter.host)) {
      const el = document.querySelector(adapter.inputSelector);
      if (el) return { target: el, adapter: adapter };
    }
  }

  // 2. Fallback: Active Element
  if (document.activeElement && 
      (document.activeElement.isContentEditable || 
       document.activeElement.tagName === 'TEXTAREA' || 
       document.activeElement.tagName === 'INPUT')) {
    return { 
      target: document.activeElement, 
      adapter: { name: 'fallback' } 
    };
  }

  // 3. Last Resort: Find first textarea or contenteditable
  const firstInput = document.querySelector('textarea, div[contenteditable="true"]');
  if (firstInput) {
      return { target: firstInput, adapter: { name: 'last-resort' } };
  }
  
  return { target: null, adapter: null };
}

// Crypto Helpers
async function getDecryptionKey() {
  const data = await chrome.storage.local.get('voicemux_key');
  if (!data.voicemux_key) return null;
  const rawKey = Uint8Array.from(atob(data.voicemux_key), c => c.charCodeAt(0));
  return await crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, ["decrypt"]);
}

async function decrypt(payload) {
  if (!payload.ciphertext || !payload.iv) return payload.text || "";
  try {
    const key = await getDecryptionKey();
    if (!key) throw new Error("Key not found");
    const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(payload.ciphertext), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("[E2EE] Decryption failed:", e);
    return "[Decryption Error]";
  }
}

function forceInject(element, text) {
  if (!element) return;
  element.focus();
  
  // React Hack: Call native value setter to bypass React's state tracking
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    const proto = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    
    if (nativeSetter) {
        nativeSetter.call(element, text);
    } else {
        element.value = text;
    }
  } else {
      // ContentEditable
      element.innerText = text;
  }

  // Dispatch events to trigger UI updates (enable send buttons etc)
  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  
  moveCursorToEnd(element);
}

function moveCursorToEnd(element) {
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    element.selectionStart = element.selectionEnd = element.value.length;
  } else if (element.isContentEditable) {
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }
}

function triggerEnter(target) {
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true, view: window };
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keypress', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
}

// Message Listener
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  const { target, adapter } = await getTargetAndAdapter();
  
  if (!target) {
      console.warn("VoiceMux: No suitable input target found.");
      return;
  }

  const plaintext = await decrypt(request.payload);

  if (request.action === "update_text") {
    forceInject(target, plaintext);
  } else if (request.action === "confirm_send") {
    forceInject(target, plaintext);
    
    setTimeout(() => {
        // Case 1: Explicitly set to not submit (null)
        if (adapter && adapter.submitSelector === null) {
            console.log("VoiceMux: Submit skipped (configured as null).");
            return;
        }

        // Case 2: Try to find submit button via selector
        let btn = null;
        if (adapter && adapter.submitSelector) {
            btn = document.querySelector(adapter.submitSelector);
        }

        // Case 3: Click if found, otherwise fallback to Enter
        if (btn && !btn.disabled) {
            btn.click();
        } else {
            // Fallback: Press Enter
            triggerEnter(target);
        }
    }, 100);
  }
});

function safeCheckConnection() {
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({ action: "check_connection" }).catch(() => {});
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    safeCheckConnection();
  }
});
