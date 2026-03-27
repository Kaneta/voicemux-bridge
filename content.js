/**
 * VoiceMux Bridge: Content Script
 * Version: 2.56.57.4
 * 
 * DESIGN INTENT:
 * Acts as the final execution layer for remote commands.
 * It is designed to be extremely verbose in logs to aid AI-based debugging
 * and uses redundant checks to ensure target stability.
 */

if (window.VOICEMUX_INITIALIZED) {
  console.log("VoiceMux: Already initialized in this tab.");
} else {
  window.VOICEMUX_INITIALIZED = true;
  function isExtensionContextAlive() {
    try {
      return !!globalThis.chrome?.runtime?.id;
    } catch {
      return false;
    }
  }

  function safeGetManifestVersion() {
    try {
      return isExtensionContextAlive() ? chrome.runtime.getManifest().version : "unknown";
    } catch {
      return "unknown";
    }
  }

  function safeSendRuntimeMessage(message) {
    try {
      if (!isExtensionContextAlive()) { return Promise.resolve(null); }
      return chrome.runtime.sendMessage(message).catch(() => {
        return null;
      });
    } catch {
      return Promise.resolve(null);
    }
  }

  function safeStorageGet(key, callback) {
    try {
      if (!isExtensionContextAlive()) {
        callback({});
        return;
      }
      chrome.storage.local.get(key, (data) => {
        if (chrome.runtime?.lastError) {
          callback({});
          return;
        }
        callback(data || {});
      });
    } catch {
      callback({});
    }
  }

  function safeStorageSet(value) {
    try {
      if (!isExtensionContextAlive()) { return; }
      chrome.storage.local.set(value);
    } catch {
      // ignore invalidated extension context
    }
  }

  const version = safeGetManifestVersion();
  console.log(`VoiceMux Bridge v${version} Loaded.`);
  const DEBUG_LOG_KEY = "voicemux_debug_events";
  const DEBUG_LOG_LIMIT = 50;

  let adaptersCache = [];
  let loadPromise = null;
  let lastClickedElement = null;
  let lastInterimLength = 0;
  let pendingSubmit = false;
  let pendingSubmitTimer = null;
  const INPUT_LOCK_MS = 2000;
  const SUBMIT_SETTLE_MS = 120;
  let lastUserInteraction = 0;

  function isHubPairSurface() {
    return (
      window.location.hostname === "hub.knc.jp" &&
      (window.location.pathname === "/pair" || window.location.pathname.startsWith("/pair/"))
    );
  }

  function isFoundationPairSurface() {
    return (
      window.location.hostname === "pair.knc.jp" &&
      (window.location.pathname === "/pair" || window.location.pathname.startsWith("/pair/"))
    );
  }

  function isInsertionDisabled() {
    return (
      document?.documentElement?.dataset?.voicemuxDisableInsertion === "true" ||
      isHubPairSurface() ||
      isFoundationPairSurface()
    );
  }

  function appendDebugEvent(event, detail = {}) {
    const entry = {
      ts: new Date().toISOString(),
      source: "content",
      event,
      detail: {
        host: window.location.hostname,
        path: window.location.pathname,
        ...detail
      }
    };

    safeStorageGet(DEBUG_LOG_KEY, (data) => {
      const existing = Array.isArray(data[DEBUG_LOG_KEY]) ? data[DEBUG_LOG_KEY] : [];
      const next = [...existing.slice(-(DEBUG_LOG_LIMIT - 1)), entry];
      safeStorageSet({ [DEBUG_LOG_KEY]: next });
    });
  }

  async function loadAdapters() {
    if (loadPromise) { return loadPromise; }

    loadPromise = (async () => {
      try {
        if (!isExtensionContextAlive()) {
          adaptersCache = [];
          return;
        }

        const builtInUrl = chrome.runtime.getURL("adapters.json");
        const builtInRes = await fetch(builtInUrl);
        const builtInAdapters = await builtInRes.json();
        const storage = await chrome.storage.local.get("custom_adapters").catch(() => {
          return {};
        });
        const customAdapters = storage.custom_adapters || [];
        const normalizedCustom = customAdapters.map((adapter) => {
          return {
            name: adapter.name || "Custom",
            host: adapter.host,
            inputSelector: adapter.inputSelector ?? (Array.isArray(adapter.selectors) ? adapter.selectors.join(",") : adapter.selectors),
            submitSelector: adapter.submitSelector ?? (Array.isArray(adapter.sendBtns) ? adapter.sendBtns.join(",") : adapter.sendBtns)
          };
        });

        adaptersCache = [...normalizedCustom, ...builtInAdapters];
      } catch (e) {
        console.error("VoiceMux: Failed to load adapters", e);
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  }

  if (isExtensionContextAlive()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.custom_adapters) {
        void loadAdapters();
      }
    });
  }
  void loadAdapters();

  function isEditableElement(el) {
    return !!el && (
      el.isContentEditable ||
      el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes(el.type)) ||
      el.getAttribute?.("role") === "textbox"
    );
  }

  function normalizeEditableRoot(el) {
    if (!el || !(el instanceof Element)) { return null; }

    let current = el;
    let parent = current.parentElement;

    while (
      parent &&
      isEditableElement(parent) &&
      (parent.isContentEditable || parent.getAttribute?.("role") === "textbox")
    ) {
      current = parent;
      parent = current.parentElement;
    }

    return current;
  }

  function resolveEditableTarget(start) {
    if (!start || !(start instanceof Element)) { return null; }

    if (isEditableElement(start)) { return normalizeEditableRoot(start); }

    const closest = start.closest(
      "textarea, input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']), [contenteditable='true'], [role='textbox']"
    );

    return normalizeEditableRoot(closest);
  }

  function resolveAdapterTarget(adapter, start) {
    if (!adapter?.inputSelector) { return null; }

    const selectors = adapter.inputSelector
      .split(",")
      .map((selector) => {
        return selector.trim();
      })
      .filter(Boolean);

    for (const selector of selectors) {
      if (start instanceof Element) {
        const matched = start.closest(selector);
        if (matched) {
          return normalizeEditableRoot(matched);
        }
      }

      const found = document.querySelector(selector);
      if (found) {
        return normalizeEditableRoot(found);
      }
    }

    return null;
  }

  function resolveSubmitTarget(adapter, start) {
    if (!adapter?.submitSelector) { return null; }

    const selectors = adapter.submitSelector
      .split(",")
      .map((selector) => {
        return selector.trim();
      })
      .filter(Boolean);

    for (const selector of selectors) {
      if (start instanceof Element) {
        const scopedRoot = start.closest("form, main, section, article, [role='dialog']") || start.parentElement;
        const scopedMatch = scopedRoot?.querySelector?.(selector);
        if (scopedMatch instanceof HTMLElement) {
          return scopedMatch;
        }
      }

      const found = document.querySelector(selector);
      if (found instanceof HTMLElement) {
        return found;
      }
    }

    return null;
  }

  function triggerSubmit(target, adapter) {
    const submitTarget = resolveSubmitTarget(adapter, target);
    if (submitTarget && !submitTarget.hasAttribute("disabled") && submitTarget.getAttribute("aria-disabled") !== "true") {
      submitTarget.click();
      return "button";
    }

    target.focus();
    const isMultiline = target.tagName === "TEXTAREA" || target.isContentEditable || target.getAttribute?.("role") === "textbox";
    const enterEventInit = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };

    target.dispatchEvent(new KeyboardEvent("keydown", isMultiline ? { ...enterEventInit } : enterEventInit));
    target.dispatchEvent(new KeyboardEvent("keypress", isMultiline ? { ...enterEventInit } : enterEventInit));
    target.dispatchEvent(new KeyboardEvent("keyup", isMultiline ? { ...enterEventInit } : enterEventInit));

    return "keyboard";
  }

  function getTargetValue(target) {
    if (!target) { return ""; }
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
      return target.value || "";
    }
    return target.innerText || target.textContent || "";
  }

  function flushPendingSubmit(target, adapter) {
    if (!pendingSubmit) { return; }
    if (pendingSubmitTimer) {
      clearTimeout(pendingSubmitTimer);
    }
    pendingSubmitTimer = setTimeout(() => {
      pendingSubmitTimer = null;
      if (!pendingSubmit) { return; }
      const value = getTargetValue(target).trim();
      if (!value) {
        appendDebugEvent("submit_skipped", {
          adapter: adapter?.name || "none",
          reason: "empty_target"
        });
        return;
      }
      pendingSubmit = false;
      const submitMode = triggerSubmit(target, adapter);
      appendDebugEvent("submit_triggered", {
        adapter: adapter?.name || "none",
        mode: submitMode,
        host: window.location.hostname
      });
    }, SUBMIT_SETTLE_MS);
  }

  // [Intent: Capture Explicit User Intent]
  // We track the last clicked element to respect where the user wants to type.
  document.addEventListener("mousedown", (e) => {
    if (isInsertionDisabled()) { return; }

    lastUserInteraction = Date.now();
    const el = resolveEditableTarget(e.target);
    if (el) {
      lastClickedElement = el;
      appendDebugEvent("target_captured", {
        tag: el.tagName,
        role: el.getAttribute?.("role") || ""
      });
      safeSendRuntimeMessage({
        action: "TARGET_FOCUS",
        tag: el.tagName,
        role: el.getAttribute?.("role") || ""
      });
      console.log("[Intent: Focus] Target captured via click:", el.tagName, el.getAttribute?.("role") || "");
    }
  }, true);

  document.addEventListener("keydown", () => {
    lastUserInteraction = Date.now();
  }, true);

  /**
   * [Intent: Predictable Target Selection]
   * Resolves the best candidate for text injection with redundant fallbacks.
   * @returns {HTMLElement|null}
   */
  async function getTargetAndAdapter() {
    const url = window.location.href;
    if (adaptersCache.length === 0) {
      await loadAdapters();
    }

    const adapter = adaptersCache.find((item) => {
      return item.host && url.includes(item.host);
    });

    // 1. Priority: Explicitly clicked element
    if (lastClickedElement && document.contains(lastClickedElement)) {
      const adapterTarget = resolveAdapterTarget(adapter, lastClickedElement);
      if (adapterTarget) {
        return { target: adapterTarget, adapter };
      }

      return { target: normalizeEditableRoot(lastClickedElement), adapter: { name: "clicked-element" } };
    }

    // 2. Priority: Currently active (focused) element
    const active = resolveEditableTarget(document.activeElement);
    if (active) {
      return { target: active, adapter: { name: "active-element" } };
    }

    // 3. Priority: Site adapter
    if (adapter?.inputSelector) {
      const adapterTarget = resolveAdapterTarget(adapter, document.activeElement);
      if (adapterTarget) {
        console.log("[Intent: Adapter] Found target via adapter:", adapter.name);
        return { target: adapterTarget, adapter };
      }
    }

    // 4. Priority: Common search bars and generic textbox fallbacks
    const searchSelectors = [
      "div[contenteditable='true']",
      "[role='textbox']",
      "textarea[name='q']",
      "input[name='q']",
      "input[type='search']",
      "[role='combobox']",
      "textarea"
    ];
    
    for (const selector of searchSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        console.log("[Intent: Fallback] Found target via selector:", selector);
        return { target: normalizeEditableRoot(el), adapter: { name: "fallback", inputSelector: selector } };
      }
    }

    return { target: null, adapter: null };
  }

  /**
   * [Intent: Reliable Framework-Safe Injection]
   * Triggers native events to ensure React/Svelte/Vue apps pick up the change.
   */
  function forceInject(element, text) {
    if (!element) { return; }
    
    // Guard against local typing overlap
    const now = Date.now();
    if (now - lastUserInteraction < INPUT_LOCK_MS) {
      console.warn("[Intent: Guard] Injection blocked due to recent user activity.");
      return;
    }

    const isInput = (element.tagName === "TEXTAREA" || element.tagName === "INPUT");
    element.focus();
    
    try {
      if (isInput) {
        const proto = element.tagName === "INPUT" ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) {
          setter.call(element, text);
        } else {
          element.value = text;
        }
      } else {
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
        document.execCommand("insertText", false, text);
      }
    } catch (e) {
      console.error("[Intent: Error] Native injection failed, using fallback.", e);
      if (isInput) { element.value = text; }
      else { element.innerText = text; }
    }

    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: text }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // [Intent: Atomic Message Processing]
  if (isExtensionContextAlive()) {
    chrome.runtime.onMessage.addListener(async (request) => {
      // 1. Log EVERY incoming message for absolute transparency
      console.debug("[Intent: Debug] Received message:", request);
      appendDebugEvent("message_received", {
        action: request.action || request.command || null,
        hasPlaintext: !!request.plaintext
      });

    // 2. Handle LOG commands (High visibility debugging)
    if (request.action === "LOG") {
      const style = "background: #6750A4; color: white; padding: 2px 4px; border-radius: 2px;";
      console.log("%cREMOTE", style, request.message);
      return;
    }

    // 3. Resolve Action and Data
    const action = request.action || request.command;
    let data = "";
    if (request.plaintext) { data = request.plaintext; }
    else if (request.text) { data = request.text; }
    else if (request.data) { data = request.data.text || ""; }

    if (!action) {
      console.warn("[Intent: Guard] Received message with no action/command.");
      return;
    }

    if (isInsertionDisabled()) {
      appendDebugEvent("injection_blocked", {
        action,
        reason: "page_opt_out"
      });
      console.info("[Intent: Guard] Injection disabled on this page.", window.location.pathname, action);
      return;
    }

    // 4. Execution Block
    try {
      const { target, adapter } = await getTargetAndAdapter();
      if (!target) {
        appendDebugEvent("target_missing", {
          action,
          activeTag: document.activeElement?.tagName || null
        });
        console.warn(
          "[Intent: Guard] No target for injection.",
          "host=", window.location.hostname,
          "path=", window.location.pathname,
          "active=", document.activeElement?.tagName
        );
        return;
      }

      console.group(`VoiceMux Action: ${action}`);
      appendDebugEvent("target_resolved", {
        action,
        tag: target.tagName,
        role: target.getAttribute?.("role") || "",
        adapter: adapter?.name || "none",
        length: data.length
      });
      console.log(
        "[Intent: Inject] Target resolved:",
        target.tagName,
        target.getAttribute?.("role") || "",
        "adapter=",
        adapter?.name || "none",
        "len=",
        data.length,
        "host=",
        window.location.hostname
      );
      if (action === "update_text" || action === "MIRROR") {
        forceInject(target, data);
        flushPendingSubmit(target, adapter);
      } else if (action === "INTERIM") {
        target.focus();
        for (let i = 0; i < lastInterimLength; i++) {
          document.execCommand("delete", false, null);
        }
        if (data) {
          document.execCommand("insertText", false, data);
          lastInterimLength = data.length;
        } else {
          lastInterimLength = 0;
        }
        if (data) {
          flushPendingSubmit(target, adapter);
        }
      } else if (action === "INSERT") {
        target.focus();
        for (let i = 0; i < lastInterimLength; i++) {
          document.execCommand("delete", false, null);
        }
        lastInterimLength = 0;
        if (data) {
          document.execCommand("insertText", false, data);
          target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: data }));
        }
        flushPendingSubmit(target, adapter);
      } else if (action === "NEWLINE") {
        target.focus();
        document.execCommand("insertText", false, "\n");
      } else if (action === "CLEAR") {
        target.focus();
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
          target.value = "";
        } else {
          document.execCommand("selectAll", false, null);
          document.execCommand("delete", false, null);
        }
        target.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (action === "SUBMIT") {
        pendingSubmit = true;
        if (!lastInterimLength && (data || getTargetValue(target).trim())) {
          flushPendingSubmit(target, adapter);
        }
      }
    } catch (err) {
      appendDebugEvent("command_failed", {
        action,
        error: err instanceof Error ? err.message : String(err)
      });
      console.error("[Intent: Error] Command execution failed:", err);
    } finally {
      console.groupEnd();
    }
    });
  }
}
