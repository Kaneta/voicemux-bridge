const test = require("node:test");
const assert = require("node:assert/strict");

const { createBackgroundTabs } = require("../background-tabs.js");

function createTabsEnvironment(options = {}) {
  const debugEvents = [];
  const queryCalls = [];
  const updateCalls = [];
  const createCalls = [];
  const windowUpdateCalls = [];
  const sendMessageCalls = [];
  let preferredTabId = options.preferredTabId ?? null;

  const tabsForUrlQuery = options.tabsForUrlQuery || [];
  const tabsForActiveQuery = options.tabsForActiveQuery || [];
  const tabsById = new Map(
    (options.tabsById || []).map((tab) => {
      return [tab.id, tab];
    })
  );

  const originalChrome = global.chrome;

  global.chrome = {
    runtime: {
      lastError: null
    },
    storage: {
      local: {
        async get(keys) {
          const result = {};
          if (Array.isArray(keys) && keys.includes("voicemux_key")) {
            result.voicemux_key = options.voicemuxKey || "";
          }
          if (Array.isArray(keys) && keys.includes("voicemux_hub_url")) {
            result.voicemux_hub_url = options.voicemuxHubUrl || "https://hub.knc.jp";
          }
          return result;
        }
      }
    },
    tabs: {
      query(queryInfo, callback) {
        queryCalls.push(queryInfo);
        if (queryInfo.url) {
          callback(tabsForUrlQuery);
          return;
        }
        callback(tabsForActiveQuery);
      },
      create(props, callback) {
        createCalls.push(props);
        callback?.({ id: 777, ...props });
      },
      update(tabId, props, callback) {
        updateCalls.push({ tabId, props });
        callback?.({ id: tabId, ...props });
      },
      get(tabId, callback) {
        const tab = tabsById.get(tabId) || null;
        callback(tab);
      },
      sendMessage(tabId, payload) {
        sendMessageCalls.push({ tabId, payload });
        return Promise.resolve();
      }
    },
    windows: {
      update(windowId, props, callback) {
        windowUpdateCalls.push({ windowId, props });
        callback?.({ id: windowId, ...props });
      }
    }
  };

  const tabsState = createBackgroundTabs({
    appendDebugEvent(event, detail) {
      debugEvents.push({ event, detail });
    },
    async getPairOrigin() {
      return options.pairOrigin || "https://pair.knc.jp";
    },
    getPreferredTabId() {
      return preferredTabId;
    },
    setPreferredTabId(value) {
      preferredTabId = value;
    }
  });

  return {
    debugEvents,
    createCalls,
    queryCalls,
    sendMessageCalls,
    tabsState,
    updateCalls,
    windowUpdateCalls,
    getPreferredTabId() {
      return preferredTabId;
    },
    restore() {
      global.chrome = originalChrome;
    }
  };
}

test("openOrFocusPairSurface focuses an existing pair tab", async () => {
  const env = createTabsEnvironment({
    tabsForUrlQuery: [
      {
        id: 42,
        windowId: 9,
        url: "https://pair.knc.jp/chrome/abc"
      }
    ]
  });

  try {
    const result = await env.tabsState.openOrFocusPairSurface();

    assert.deepEqual(result, {
      action: "focused_existing",
      tabId: 42,
      url: "https://pair.knc.jp/chrome/abc"
    });
    assert.deepEqual(env.updateCalls, [{ tabId: 42, props: { active: true } }]);
    assert.deepEqual(env.windowUpdateCalls, [{ windowId: 9, props: { focused: true } }]);
    assert.equal(env.createCalls.length, 0);
    assert.equal(env.debugEvents.at(-1)?.event, "open_pair_surface.focus_existing");
  } finally {
    env.restore();
  }
});

test("openOrFocusPairSurface creates a tab when no pair tab exists", async () => {
  const env = createTabsEnvironment();

  try {
    const result = await env.tabsState.openOrFocusPairSurface();

    assert.deepEqual(result, {
      action: "created_new",
      tabId: 777,
      url: "https://pair.knc.jp/chrome"
    });
    assert.deepEqual(env.createCalls, [{ url: "https://pair.knc.jp/chrome" }]);
    assert.equal(env.debugEvents.at(-1)?.event, "open_pair_surface.create_new");
  } finally {
    env.restore();
  }
});

test("notifyActiveTab falls back from a stale preferred tab to the active tab", async () => {
  const env = createTabsEnvironment({
    preferredTabId: 99,
    tabsForActiveQuery: [
      {
        id: 5,
        url: "https://example.com/editor"
      }
    ]
  });

  try {
    env.tabsState.notifyActiveTab(
      {
        action: "INSERT_TEXT",
        plaintext: "hello",
        sender_tab_id: "mobile-1"
      },
      "remote_command"
    );

    await Promise.resolve();

    assert.equal(env.getPreferredTabId(), null);
    assert.deepEqual(env.sendMessageCalls, [
      {
        tabId: 5,
        payload: {
          action: "LOG",
          message: "📡 [remote_command] | Sender: mobile-1"
        }
      },
      {
        tabId: 5,
        payload: {
          action: "INSERT_TEXT",
          plaintext: "hello",
          sender_tab_id: "mobile-1"
        }
      }
    ]);
    assert.equal(env.debugEvents.at(-1)?.event, "notifyActiveTab");
  } finally {
    env.restore();
  }
});

test("notifyActiveTab does not dispatch non-actionable presence chatter", async () => {
  const env = createTabsEnvironment({
    tabsForActiveQuery: [
      {
        id: 7,
        url: "https://example.com"
      }
    ]
  });

  try {
    env.tabsState.notifyActiveTab(
      {
        sender_tab_id: "mobile-1",
        role: "mobile"
      },
      "device_online"
    );

    await Promise.resolve();

    assert.deepEqual(env.sendMessageCalls, []);
    assert.equal(env.debugEvents.at(-1)?.event, "notifyActiveTab");
  } finally {
    env.restore();
  }
});
