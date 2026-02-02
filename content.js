// VoiceMux Bridge Content Script v2.4 (Custom Adapters Support)
console.log("VoiceMux Bridge v2.4 Loaded");

const SITE_ADAPTERS = [
  {
    name: 'gemini',
    match: (url) => url.includes("gemini.google.com"),
    selectors: ['div[contenteditable="true"]', '.rich-textarea', 'div[role="textbox"]'],
    sendBtns: ['button[aria-label*="送信"]', 'button[aria-label*="Send"]', 'button.send-button', () => document.querySelector('span.material-symbols-outlined')?.closest('button')]
  },
  {
    name: 'chatgpt',
    match: (url) => url.includes("chatgpt.com"),
    selectors: ['#prompt-textarea'],
    sendBtns: ['button[data-testid="send-button"]']
  },
  {
    name: 'claude',
    match: (url) => url.includes("claude.ai"),
    selectors: ['div[contenteditable="true"]'],
    sendBtns: ['button[aria-label*="Send"]', 'button[aria-label*="送信"]']
  },
  {
    name: 'perplexity',
    match: (url) => url.includes("perplexity.ai"),
    selectors: ['textarea'],
    sendBtns: ['button[aria-label*="Submit"]', 'button[aria-label*="Ask"]']
  },
  {
    name: 'treenote',
    match: (url) => url.includes("treenoteweb.pages.dev"),
    selectors: ['textarea.auto-resize-textarea', 'textarea', 'div[contenteditable="true"]'],
    sendBtns: ['button.submit-btn']
  },
  {
    name: 'fallback',
    match: () => true,
    selectors: [() => document.activeElement],
    sendBtns: []
  }
];

// ★ Merged Target Selection (Custom > Hardcoded > Fallback)
async function getTargetAndAdapter() {
  const url = window.location.href;
  
  // 1. Fetch Custom Adapters from storage
  const storage = await chrome.storage.local.get('custom_adapters');
  const customAdapters = storage.custom_adapters || [];

  // Try Custom Adapters first
  for (const a of customAdapters) {
    if (a.host && url.includes(a.host)) {
      const el = findElement(a.selectors);
      if (el) return { target: el, adapter: a };
    }
  }

  // 2. Try Hardcoded Adapters
  const specificAdapter = SITE_ADAPTERS.find(a => a.match(url) && a.name !== 'fallback');
  if (specificAdapter) {
    const el = findElement(specificAdapter.selectors);
    if (el) return { target: el, adapter: specificAdapter };
  }

  // 3. Fallback to active element
  const fallbackAdapter = SITE_ADAPTERS.find(a => a.name === 'fallback');
  const activeEl = findElement(fallbackAdapter.selectors);
  
  return { target: activeEl, adapter: fallbackAdapter };
}

function findElement(selectors) {
  if (!selectors) return null;
  for (const sel of selectors) {
    let el = (typeof sel === 'function') ? sel() : document.querySelector(sel);
    if (el) return el;
  }
  return null;
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
  if (element.isContentEditable) {
    if (element.innerText !== text) element.innerText = text;
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  } else if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    const proto = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) nativeSetter.call(element, text);
    else element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }
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
  if (!target) return;

  const plaintext = await decrypt(request.payload);

  if (request.action === "update_text") {
    forceInject(target, plaintext);
  } else if (request.action === "confirm_send") {
    forceInject(target, plaintext);
    setTimeout(() => {
        const btn = findElement(adapter.sendBtns);
        if (btn && !btn.disabled && typeof btn.click === 'function') btn.click();
        else triggerEnter(target);
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