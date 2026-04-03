(function attachBackgroundTabs(globalScope) {
  function createBackgroundTabs(deps) {
    function queryTabs(queryInfo) {
      return new Promise((resolve) => {
        chrome.tabs.query(queryInfo, (tabs) => {
          resolve(tabs || []);
        });
      });
    }

    function createTab(createProperties) {
      return new Promise((resolve) => {
        chrome.tabs.create(createProperties, (tab) => {
          resolve(tab || null);
        });
      });
    }

    function updateTab(tabId, updateProperties) {
      return new Promise((resolve) => {
        chrome.tabs.update(tabId, updateProperties, (tab) => {
          resolve(tab || null);
        });
      });
    }

    function focusWindow(windowId) {
      return new Promise((resolve) => {
        if (!Number.isInteger(windowId)) {
          resolve(null);
          return;
        }
        chrome.windows.update(windowId, { focused: true }, (windowRef) => {
          resolve(windowRef || null);
        });
      });
    }

    async function openOrFocusPairSurface() {
      const pairOrigin = await deps.getPairOrigin();
      const targetUrl = `${pairOrigin}/chrome`;
      const tabs = await queryTabs({ url: `${pairOrigin}/chrome*` });
      const existingTab = tabs.find((tab) => {
        return typeof tab.url === "string" && tab.url.startsWith(targetUrl);
      });

      if (existingTab?.id) {
        await updateTab(existingTab.id, { active: true });
        await focusWindow(existingTab.windowId);
        deps.appendDebugEvent("open_pair_surface.focus_existing", {
          tabId: existingTab.id,
          url: existingTab.url || targetUrl
        });
        return { action: "focused_existing", tabId: existingTab.id, url: existingTab.url || targetUrl };
      }

      const createdTab = await createTab({ url: targetUrl });
      deps.appendDebugEvent("open_pair_surface.create_new", {
        tabId: createdTab?.id || null,
        url: targetUrl
      });
      return { action: "created_new", tabId: createdTab?.id || null, url: targetUrl };
    }

    function notifyActiveTab(payload, eventName) {
      const dispatchToTab = (activeTab) => {
        if (activeTab) {
          const isActionablePayload = !!(payload?.action || payload?.command);
          const shouldMirrorToContentLog = isActionablePayload || eventName === "phx_error";
          deps.appendDebugEvent("notifyActiveTab", {
            eventName,
            action: payload?.action || null,
            hasPlaintext: !!payload?.plaintext,
            actionable: isActionablePayload,
            tabId: activeTab.id,
            url: activeTab.url || null
          });
          console.log("VoiceMux: notifyActiveTab", {
            eventName,
            action: payload?.action || null,
            hasPlaintext: !!payload?.plaintext,
            sender: payload?.sender_tab_id || "system",
            tabId: activeTab.id,
            url: activeTab.url
          });
          if (shouldMirrorToContentLog) {
            chrome.tabs
              .sendMessage(activeTab.id, {
                action: "LOG",
                message: `📡 [${eventName}] | Sender: ${payload?.sender_tab_id || "system"}`
              })
              .catch(() => {
                /* silent */
              });
          }

          if (isActionablePayload && eventName !== "phx_reply" && eventName !== "phx_error") {
            chrome.tabs.sendMessage(activeTab.id, payload).catch(() => {
              /* silent */
            });
          }
          return;
        }

        deps.appendDebugEvent("notifyActiveTab.missed", {
          eventName,
          action: payload?.action || null
        });
        console.warn("VoiceMux: notifyActiveTab skipped because no active tab was found.", {
          eventName,
          action: payload?.action || null
        });
      };

      const preferredTabId = deps.getPreferredTabId();
      if (preferredTabId) {
        chrome.tabs.get(preferredTabId, (tab) => {
          if (chrome.runtime.lastError || !tab?.id) {
            deps.setPreferredTabId(null);
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
              dispatchToTab(tabs[0]);
            });
            return;
          }

          dispatchToTab(tab);
        });
        return;
      }

      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        dispatchToTab(tabs[0]);
      });
    }

    async function handleOpenEditor(roomId) {
      const data = await chrome.storage.local.get(["voicemux_key", "voicemux_hub_url"]);
      const key = data.voicemux_key || "";
      const hubOrigin = new URL(data.voicemux_hub_url || "https://hub.knc.jp").origin;
      const targetUrl = `${hubOrigin}/review/${roomId}${key ? "#key=" + key : ""}`;

      chrome.tabs.query({ url: `${hubOrigin}/*` }, (tabs) => {
        const existingTab = tabs.find((tab) => {
          return tab.url.includes(roomId);
        });

        if (existingTab) {
          chrome.tabs.update(existingTab.id, { active: true });
          chrome.windows.update(existingTab.windowId, { focused: true });
          console.log("VoiceMux: Focused existing Hub tab.");
          return;
        }

        chrome.tabs.create({ url: targetUrl });
        console.log("VoiceMux: Created new Hub tab with E2EE key.");
      });
    }

    return {
      handleOpenEditor,
      notifyActiveTab,
      openOrFocusPairSurface
    };
  }

  const api = {
    createBackgroundTabs
  };

  globalScope.VoiceMuxBackgroundTabs = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
