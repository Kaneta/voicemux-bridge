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
  const version = chrome.runtime.getManifest().version;
  console.log(`VoiceMux Bridge v${version} Loaded.`);

  let lastClickedElement = null;
  let lastInterimLength = 0;
  const INPUT_LOCK_MS = 2000;
  let lastUserInteraction = 0;

  // [Intent: Capture Explicit User Intent]
  // We track the last clicked element to respect where the user wants to type.
  document.addEventListener("mousedown", (e) => {
    lastUserInteraction = Date.now();
    const el = e.target;
    if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) {
      lastClickedElement = el;
      console.log("[Intent: Focus] Target captured via click:", el.tagName);
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
  async function getTarget() {
    // 1. Priority: Explicitly clicked element
    if (lastClickedElement && document.contains(lastClickedElement)) {
      return lastClickedElement;
    }

    // 2. Priority: Currently active (focused) element
    const active = document.activeElement;
    if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT" || active.isContentEditable)) {
      return active;
    }

    // 3. Priority: Common search bars (Google Search etc.)
    // Note: Google uses textarea[name="q"] now.
    const searchSelectors = [
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
        return el;
      }
    }

    return null;
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
  chrome.runtime.onMessage.addListener(async (request) => {
    // 1. Log EVERY incoming message for absolute transparency
    console.debug("[Intent: Debug] Received message:", request);

    // 2. Hub-side protection: Don't echo on Hub itself except for logs.
    const isHub = window.location.hostname.includes("hub.knc.jp");
    if (isHub && request.action !== "LOG") { return; }

    // 3. Handle LOG commands (High visibility debugging)
    if (request.action === "LOG") {
      const style = "background: #6750A4; color: white; padding: 2px 4px; border-radius: 2px;";
      console.log("%cREMOTE", style, request.message);
      return;
    }

    // 4. Resolve Action and Data
    const action = request.action || request.command;
    let data = "";
    if (request.plaintext) { data = request.plaintext; }
    else if (request.text) { data = request.text; }
    else if (request.data) { data = request.data.text || ""; }

    if (!action) {
      console.warn("[Intent: Guard] Received message with no action/command.");
      return;
    }

    // 5. Execution Block
    try {
      const target = await getTarget();
      if (!target) {
        console.warn("[Intent: Guard] No target for injection. Active element:", document.activeElement?.tagName);
        return;
      }

      console.group(`VoiceMux Action: ${action}`);
      if (action === "update_text" || action === "MIRROR") {
        forceInject(target, data);
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
      }
    } catch (err) {
      console.error("[Intent: Error] Command execution failed:", err);
    } finally {
      console.groupEnd();
    }
  });
}
