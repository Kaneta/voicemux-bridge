// VoiceMux Bridge Content Script v2.6 (Dynamic Injection & Storage Sync)
if (window.VOICEMUX_INITIALIZED) {
  console.log("VoiceMux: Already initialized in this tab.");
} else {
  window.VOICEMUX_INITIALIZED = true;
  console.log("VoiceMux Bridge v2.6 Loaded");

  let ADAPTERS_CACHE = [];
  let loadPromise = null;

  // ★ Initialize Adapters
  /** Fetches and merges built-in and custom site adapters into a local cache. */
  async function loadAdapters() {
    // If a load is already in progress, return the existing promise
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
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
      } finally {
        loadPromise = null; // Reset for potential future forced reloads
      }
    })();

    return loadPromise;
  }

  // Listen for storage changes to sync adapters in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.custom_adapters) {
      console.log("VoiceMux: Custom adapters updated, reloading...");
      loadAdapters();
    }
  });

  // Start loading immediately
  loadAdapters();

  // ★ Target Selection
  /** Identifies the best input element and its corresponding adapter for the current page context. */
  async function getTargetAndAdapter() {
    const url = window.location.href;
    
    // Ensure adapters are loaded
    if (ADAPTERS_CACHE.length === 0) await loadAdapters();

    // Find matching adapter for this host
    const adapter = ADAPTERS_CACHE.find(a => a.host && url.includes(a.host));

    // 1. Highest Priority: Active Element (If it's an input/editable)
    const active = document.activeElement;
    if (active && 
        (active.isContentEditable || 
         active.tagName === 'TEXTAREA' || 
         (active.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(active.type)))) {
      return { target: active, adapter: adapter || { name: 'active-element' } };
    }

    // 2. Secondary: Try to find a matching element via Adapter selector
    if (adapter) {
      const el = document.querySelector(adapter.inputSelector);
      if (el) return { target: el, adapter: adapter };
    }

    // 3. Last Resort: Find first textarea or contenteditable
    const firstInput = document.querySelector('textarea, div[contenteditable="true"]');
    if (firstInput) {
        return { target: firstInput, adapter: { name: 'last-resort' } };
    }
    
    return { target: null, adapter: null };
  }

  // Crypto Helpers
  /** Imports the raw AES-GCM decryption key from storage. */
  async function getDecryptionKey() {
    const data = await chrome.storage.local.get('voicemux_key');
    if (!data.voicemux_key) return null;
    const rawKey = Uint8Array.from(atob(data.voicemux_key), c => c.charCodeAt(0));
    return await crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, ["decrypt"]);
  }

  /** Decrypts the received payload (ciphertext/iv) and returns plaintext string. */
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

  /** Injects text into a target element, bypassing React's internal state tracking. */
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

  /** Positions the text cursor at the end of the input or contenteditable element. */
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

  /** Dispatches a sequence of Enter key events to the target element to trigger submission. */
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

  /** Signals the background script to check or re-establish the WebSocket connection. */
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
}
