// VoiceMux Bridge Content Script v2.1.0 (Clean Architecture)
if (window.VOICEMUX_INITIALIZED) {
  console.log("VoiceMux: Already initialized in this tab.");
} else {
  window.VOICEMUX_INITIALIZED = true;
  console.group("VoiceMux Bridge v2.2.22");
  console.log("Status: Content Script Loaded");
  console.groupEnd();

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

  let lastUserInteraction = 0;
  let lastInterimLength = 0; // PC側で保持する「最後に挿入した未確定文字の長さ」
  const INPUT_LOCK_MS = 2000;
  const SUBMIT_DELAY_MS = 150;

  // Listen for local interaction to prevent remote fighting
  document.addEventListener('keydown', () => lastUserInteraction = Date.now(), true);
  document.addEventListener('mousedown', () => lastUserInteraction = Date.now(), true);

  /** 
   * Hybrid Text Injection: v1.4 Stability + v2.2.2 Mirroring
   */
  function forceInject(element, text) {
    if (!element) return;
    
    const now = Date.now();
    if (now - lastUserInteraction < INPUT_LOCK_MS) {
      console.log("VoiceMux: Local interaction detected. Skipping remote update.");
      return;
    }

    // 1. Robust comparison (Check multiple text properties to avoid redundant churn)
    const val = (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT' ? element.value : (element.innerText || element.textContent)) || "";
    if (val.trim() === text.trim()) return;

    console.log(`VoiceMux: Mirroring into ${element.tagName}. New Length: ${text.length}`);
    element.focus();

    try {
      if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        // --- v1.4 PROTOTYPE SETTER HACK ---
        const proto = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        
        if (nativeSetter) {
          nativeSetter.call(element, text);
        } else {
          element.value = text;
        }
      } else if (element.isContentEditable) {
        // --- v2.2.4 ATOMIC MIRRORING ---
        // DESIGN INTENT: Aggressive Clear + Insert.
        // Modern editors often hijack 'selectAll' or 'paste'. 
        // By selecting and DELETING before insertion, we force the editor
        // to treat it as a fresh start, preventing duplication.
        
        const selection = window.getSelection();
        if (selection) {
          // Double-strength selection
          document.execCommand('selectAll', false, null);
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
        }

        // Atomic transaction: Clear -> Insert
        document.execCommand('delete', false, null);
        const success = document.execCommand('insertText', false, text);
        
        if (!success) {
          element.innerText = text;
        }
      }
    } catch (e) {
      console.error("VoiceMux: Critical Injection Failure:", e);
      if (element.tagName === 'TEXTAREA') element.value = text;
      else element.innerText = text;
    }

    // 3. Mandatory State Sync (Explicitly mark as replacement)
    element.dispatchEvent(new InputEvent('input', { 
      bubbles: true, 
      inputType: 'insertReplacementText',
      data: text 
    }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
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

  /**
   * Aggressive Submission Logic: Wakes up the UI before clicking
   */
  async function performSubmit(target, adapter) {
    console.log("VoiceMux: Preparing for submission...");
    
    // 1. Final focus ritual to ensure button states refresh
    target.focus();
    target.dispatchEvent(new Event('input', { bubbles: true }));

    setTimeout(() => {
      if (adapter && adapter.submitSelector === null) return;
      
      let btn = null;
      if (adapter && adapter.submitSelector) {
        btn = document.querySelector(adapter.submitSelector);
      }

      if (btn && !btn.disabled) {
        console.log("VoiceMux: Clicking submission button.");
        btn.click();
      } else {
        console.log("VoiceMux: Submitting via Enter key.");
        triggerEnter(target);
      }
    }, SUBMIT_DELAY_MS);
  }

  function triggerEnter(target) {
      const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true, view: window };
      target.dispatchEvent(new KeyboardEvent('keydown', opts));
      target.dispatchEvent(new KeyboardEvent('keypress', opts));
      target.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  // ★ Message Listener (Plaintext from Background)
  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    const isHub = window.location.hostname.includes("hub.knc.jp") || 
                  (window.location.hostname === "localhost" && window.location.port === "5173");
    if (isHub) return;

    console.group("VoiceMux: Remote Command");
    try {
      const { target, adapter } = await getTargetAndAdapter();
      const plaintext = request.plaintext;
      
      let finalTarget = target;
      if (!finalTarget) {
        const active = document.activeElement;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable)) {
          finalTarget = active;
        }
      }

      if (!finalTarget) {
        console.warn("VoiceMux: No target for injection.");
        console.groupEnd();
        return;
      }

      if (request.action === "update_text") {
        forceInject(finalTarget, plaintext);
      } else if (request.action === "INTERIM") {
        // DESIGN INTENT: Real-time preview without duplication.
        // Delete the previous interim text before inserting the new one.
        console.log(`VoiceMux: Handling INTERIM command. (Rolling back ${lastInterimLength} chars)`);
        const textToInsert = request.text || plaintext || "";
        finalTarget.focus();

        // 1. 前回の未確定分を削除
        for (let i = 0; i < lastInterimLength; i++) {
          document.execCommand('delete', false, null);
        }

        // 2. 新しい未確定テキストを挿入し、長さを記憶
        if (textToInsert) {
          document.execCommand('insertText', false, textToInsert);
          lastInterimLength = textToInsert.length;
        } else {
          lastInterimLength = 0;
        }
      } else if (request.action === "INSERT") {
        console.log("VoiceMux: Handling INSERT command.");
        const textToInsert = request.text || plaintext || "";
        finalTarget.focus();

        // 1. 確定時も、一度未確定バッファをロールバックする
        if (lastInterimLength > 0) {
          console.log(`VoiceMux: Rolling back ${lastInterimLength} interim chars before final INSERT.`);
          for (let i = 0; i < lastInterimLength; i++) {
            document.execCommand('delete', false, null);
          }
          lastInterimLength = 0; // 確定したのでバッファをリセット
        }

        // 2. 確定テキストを挿入
        if (textToInsert) {
          document.execCommand('insertText', false, textToInsert);
          finalTarget.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: textToInsert }));
          finalTarget.dispatchEvent(new Event('change', { bubbles: true }));
          moveCursorToEnd(finalTarget);
        }
      } else if (request.action === "NEWLINE") {
        console.log("VoiceMux: Handling NEWLINE command.");
        finalTarget.focus();
        document.execCommand('insertText', false, '\n');
        finalTarget.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '\n' }));
        finalTarget.dispatchEvent(new Event('change', { bubbles: true }));
        moveCursorToEnd(finalTarget);
      } else if (request.action === "SUBMIT" || request.action === "confirm_send") {
        // DESIGN INTENT: SUBMIT is now decoupled from text injection.
        // It only wakes up the UI and clicks the button.
        console.log("VoiceMux: Handling SUBMIT command.");
        await performSubmit(finalTarget, adapter);
      } else if (request.action === "CLEAR") {
        console.log("VoiceMux: Clearing target element.");
        if (finalTarget.tagName === 'TEXTAREA' || finalTarget.tagName === 'INPUT') {
          // Native setter hack for clearing
          const proto = finalTarget.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (nativeSetter) nativeSetter.call(finalTarget, "");
          else finalTarget.value = "";
        } else {
          // ContentEditable clear
          finalTarget.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
        }
        finalTarget.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (request.action === "LOG") {
        const style = "background: #6750A4; color: white; padding: 2px 4px; border-radius: 2px;";
        if (request.log_level === 'error') console.error("%cREMOTE", style, request.message);
        else if (request.log_level === 'warn') console.warn("%cREMOTE", style, request.message);
        else console.log("%cREMOTE", style, request.message);
      }
    } catch (err) {
      console.error("VoiceMux: Handler Error:", err);
    } finally {
      console.groupEnd();
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
