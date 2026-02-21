// VoiceMux Bridge Content Script v2.1.0 (Clean Architecture)
if (window.VOICEMUX_INITIALIZED) {
  console.log("VoiceMux: Already initialized in this tab.");
} else {
  window.VOICEMUX_INITIALIZED = true;
  console.log("VoiceMux Bridge v2.1.0 Loaded");

  /**
   * decodes Base64 strings safely.
   */
  function safeAtob(base64) {
    if (!base64) return "";
    let standardBase64 = base64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (standardBase64.length % 4 !== 0) {
      standardBase64 += '=';
    }
    try {
      return atob(standardBase64);
    } catch (e) {
      console.error("[Base64] atob failed:", e);
      return "";
    }
  }

  let ADAPTERS_CACHE = [];
  let loadPromise = null;

  // ★ Initialize Adapters
  async function loadAdapters() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const builtInUrl = chrome.runtime.getURL('adapters.json');
        const builtInRes = await fetch(builtInUrl);
        const builtInAdapters = await builtInRes.json();
        const storage = await chrome.storage.local.get('custom_adapters');
        const customAdapters = storage.custom_adapters || [];
        const normalizedCustom = customAdapters.map(a => ({
          name: a.name || "Custom",
          host: a.host,
          inputSelector: a.inputSelector ?? (Array.isArray(a.selectors) ? a.selectors.join(',') : a.selectors),
          submitSelector: a.submitSelector ?? (Array.isArray(a.sendBtns) ? a.sendBtns.join(',') : a.sendBtns)
        }));
        ADAPTERS_CACHE = [...normalizedCustom, ...builtInAdapters];
      } catch (e) {
        console.error("VoiceMux: Failed to load adapters", e);
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.custom_adapters) {
      loadAdapters();
    }
  });
  loadAdapters();

  // ★ Target Selection
  async function getTargetAndAdapter() {
    const url = window.location.href;
    if (ADAPTERS_CACHE.length === 0) await loadAdapters();
    const adapter = ADAPTERS_CACHE.find(a => a.host && url.includes(a.host));
    const active = document.activeElement;
    if (active && 
        (active.isContentEditable || 
         active.tagName === 'TEXTAREA' || 
         (active.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(active.type)))) {
      return { target: active, adapter: adapter || { name: 'active-element' } };
    }
    if (adapter) {
      const el = document.querySelector(adapter.inputSelector);
      if (el) return { target: el, adapter: adapter };
    }
    const firstInput = document.querySelector('textarea, div[contenteditable="true"]');
    if (firstInput) {
        return { target: firstInput, adapter: { name: 'last-resort' } };
    }
    return { target: null, adapter: null };
  }

  /** 
   * Injects text into a target element. 
   */
  function forceInject(element, text) {
    if (!element) return;
    element.focus();
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      const proto = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
          nativeSetter.call(element, text);
      } else {
          element.value = text;
      }
    } else if (element.isContentEditable) {
        try {
            element.textContent = text;
            const inputEvent = new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text });
            element.dispatchEvent(inputEvent);
        } catch (e) {
            element.innerText = text;
        }
    }
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

  // ★ Message Listener (Plaintext from Background)
  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    // Prevent feedback loops on Hub/localhost dev
    const isHub = window.location.hostname.includes("hub.knc.jp") || 
                  (window.location.hostname === "localhost" && window.location.port === "5173");
    if (isHub) return;

    const { target, adapter } = await getTargetAndAdapter();
    if (!target) return;

    const plaintext = request.plaintext;
    if (request.action === "update_text") {
      forceInject(target, plaintext);
    } else if (request.action === "confirm_send") {
      forceInject(target, plaintext);
      setTimeout(() => {
          if (adapter && adapter.submitSelector === null) return;
          let btn = null;
          if (adapter && adapter.submitSelector) {
              btn = document.querySelector(adapter.submitSelector);
          }
          if (btn && !btn.disabled) {
              btn.click();
          } else {
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
}
