const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO_ROOT = path.resolve(__dirname, "..");

class FakeClassList {
  constructor() {
    this.classes = new Set();
  }

  add(...names) {
    names.forEach((name) => {
      return this.classes.add(name);
    });
  }

  remove(...names) {
    names.forEach((name) => {
      return this.classes.delete(name);
    });
  }

  toggle(name, force) {
    if (force === undefined) {
      if (this.classes.has(name)) {
        this.classes.delete(name);
        return false;
      }
      this.classes.add(name);
      return true;
    }

    if (force) {
      this.classes.add(name);
      return true;
    }

    this.classes.delete(name);
    return false;
  }

  contains(name) {
    return this.classes.has(name);
  }
}

class FakeElement {
  constructor({ id = null, tagName = "DIV", attributes = {} } = {}) {
    this.id = id;
    this.tagName = tagName;
    this.attributes = { ...attributes };
    this.textContent = "";
    this.innerText = "";
    this.innerHTML = "";
    this.placeholder = "";
    this.href = "";
    this.onclick = null;
    this.style = {};
    this.classList = new FakeClassList();
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
}

function createPopupEnvironment() {
  const ids = [
    "version-display",
    "content-view",
    "content-title",
    "content-copy",
    "primary-action",
    "primary-action-skeleton",
    "primary-note",
    "guide-link",
    "maintenance-notice",
    "maintenance-link"
  ];

  const elementsById = new Map();
  ids.forEach((id) => {
    return elementsById.set(id, new FakeElement({ id }));
  });
  elementsById.get("primary-action").tagName = "BUTTON";
  elementsById.get("guide-link").tagName = "A";
  elementsById.get("maintenance-link").tagName = "A";

  const localized = [
    new FakeElement({ tagName: "H1", attributes: { "data-i18n": "name" } }),
    new FakeElement({ tagName: "A", attributes: { "data-i18n": "link_support" } }),
    elementsById.get("guide-link"),
    new FakeElement({ tagName: "A", attributes: { "data-i18n": "link_privacy" } }),
    elementsById.get("primary-action")
  ];
  elementsById.get("guide-link").attributes["data-i18n"] = "link_guide";
  elementsById.get("primary-action").attributes["data-i18n"] = "btn_open_pair_surface";

  let domContentLoadedHandler = null;

  const mockDocument = {
    addEventListener(event, handler) {
      if (event === "DOMContentLoaded") {
        domContentLoadedHandler = handler;
      }
    },
    getElementById(id) {
      return elementsById.get(id) ?? null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") {
        return localized;
      }
      return [];
    }
  };

  let storageData = {
    voicemux_room_id: "room-1",
    voicemux_token: "token-1",
    voicemux_key: "key-1",
    voicemux_pair_url: "https://pair.knc.jp",
    voicemux_mobile_connected: true,
    voicemux_paired: true,
    voicemux_pairing_code: "PAIR-1"
  };

  const tabCreateCalls = [];
  const runtimeMessages = [];
  const storageListeners = [];
  const timers = [];
  let timerId = 1;

  const messages = {
    name: "VoiceMux Bridge",
    btn_reset_connection: "Reset Room",
    link_support: "Support",
    link_guide: "Guide",
    link_privacy: "Privacy",
    url_guide: "https://knc.jp/en/docs/voicemux-bridge/",
    mobile_ready_title: "Use phone input on this PC",
    mobile_ready_copy: "",
    mobile_connected_note: "If something goes wrong:\n• Reload that web page\n• Open the extension again\n• Scan the QR code again",
    mobile_connecting_note: "Phone presence is still being confirmed. If it already works, you can keep using voice input.",
    btn_open_pair_surface: "Connect Phone",
    btn_show_qr: "Review phone connection"
  };

  const chrome = {
    i18n: {
      getMessage(key) {
        return messages[key] || "";
      }
    },
    runtime: {
      getManifest() {
        return {
          version: "2.2.0",
          version_name: "2.2.0 (build 2.56.58.24)"
        };
      },
      async sendMessage(payload) {
        runtimeMessages.push(payload);
        if (payload.action !== "RESET_ROOM") {
          return { success: true };
        }

        const removed = {};
        [
          "voicemux_room_id",
          "voicemux_token",
          "voicemux_key",
          "voicemux_paired",
          "voicemux_pairing_code",
          "voicemux_mobile_connected"
        ].forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(storageData, key)) {
            removed[key] = { oldValue: storageData[key] };
            delete storageData[key];
          }
        });

        storageListeners.forEach((listener) => {
          return listener(removed, "local");
        });
        return { success: true };
      }
    },
    storage: {
      local: {
        async get(keys) {
          const result = {};
          keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(storageData, key)) {
              result[key] = storageData[key];
            }
          });
          return result;
        },
        async remove(keys) {
          const removed = {};
          keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(storageData, key)) {
              removed[key] = { oldValue: storageData[key] };
              delete storageData[key];
            }
          });
          storageListeners.forEach((listener) => {
            return listener(removed, "local");
          });
        }
      },
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        }
      }
    },
    tabs: {
      create({ url }) {
        tabCreateCalls.push(url);
      }
    }
  };

  const context = {
    chrome,
    document: mockDocument,
    confirm: () => {
      return true;
    },
    fetch: async () => {
      return { ok: false };
    },
    console,
    setTimeout(fn, ms) {
      const id = timerId++;
      timers.push({ id, fn, ms });
      return id;
    },
    clearTimeout(id) {
      const index = timers.findIndex((timer) => {
        return timer.id === id;
      });
      if (index >= 0) {
        timers.splice(index, 1);
      }
    }
  };

  return {
    context,
    elementsById,
    setStorage(data) {
      storageData = { ...data };
    },
    getDomContentLoadedHandler() {
      return domContentLoadedHandler;
    },
    getTabCreateCalls() {
      return tabCreateCalls;
    },
    getRuntimeMessages() {
      return runtimeMessages;
    },
    async flushTimers() {
      // Loop until no more timers are left, as timers might schedule other timers
      while (timers.length > 0) {
        const currentTimers = [...timers];
        timers.length = 0;
        currentTimers.sort((a, b) => {
          return a.ms - b.ms;
        });
        for (const timer of currentTimers) {
          await timer.fn();
          // We need to settle after each timer because it might be an async fn
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        }
      }
    },
    async settle() {
      // Multiple cycles to handle cascading promises/microtasks
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
    }
  };
}

test("disconnected popup stays idle until the user opens pair surface", async () => {
  const env = createPopupEnvironment();
  env.setStorage({
    voicemux_room_id: null,
    voicemux_token: null,
    voicemux_key: null,
    voicemux_pair_url: "https://pair.knc.jp"
  });
  const source = fs.readFileSync(
    path.join(REPO_ROOT, "popup.js"),
    "utf8"
  );

  vm.runInNewContext(source, env.context, { filename: "popup.js" });

  const start = env.getDomContentLoadedHandler();
  assert.ok(start, "DOMContentLoaded handler should be registered");
  await start();
  await env.settle();
  await env.flushTimers();
  await env.settle();

  const title = env.elementsById.get("content-title");
  const versionDisplay = env.elementsById.get("version-display");

  assert.equal(env.getTabCreateCalls().length, 0);
  assert.equal(versionDisplay.innerText, "v2.2.0");
  assert.equal(title.textContent, "Use phone input on this PC");
  assert.deepEqual(env.getTabCreateCalls(), [], "popup must not auto-open /pair");
  assert.deepEqual(
    env.getRuntimeMessages().map((message) => {
      return message.action;
    }),
    ["PREWARM_PAIR_AUTH"]
  );
});

test("popup keeps a single auth-ready state while mobile presence is still being confirmed", async () => {
  const env = createPopupEnvironment();
  env.setStorage({
    voicemux_room_id: "room-1",
    voicemux_token: "token-1",
    voicemux_key: "key-1",
    voicemux_mobile_connected: false
  });

  const source = fs.readFileSync(
    path.join(REPO_ROOT, "popup.js"),
    "utf8"
  );

  vm.runInNewContext(source, env.context, { filename: "popup.js" });

  const start = env.getDomContentLoadedHandler();
  assert.ok(start, "DOMContentLoaded handler should be registered");
  await start();
  await env.settle();
  await env.flushTimers();
  await env.settle();

  const primaryAction = env.elementsById.get("primary-action");
  const contentTitle = env.elementsById.get("content-title");
  const contentCopy = env.elementsById.get("content-copy");
  const primaryNote = env.elementsById.get("primary-note");

  assert.equal(contentTitle.textContent, "Use phone input on this PC");
  assert.equal(contentCopy.textContent, "");
  assert.equal(primaryAction.classList.contains("is-hidden"), false);
  assert.equal(primaryAction.textContent, "Review phone connection");
  assert.equal(
    primaryNote.textContent,
    "Phone presence is still being confirmed. If it already works, you can keep using voice input."
  );
});

test("disconnected popup opens standalone pair surface", async () => {
  const env = createPopupEnvironment();
  env.setStorage({
    voicemux_room_id: null,
    voicemux_token: null,
    voicemux_key: null,
    voicemux_pair_url: "https://pair.knc.jp"
  });

  const source = fs.readFileSync(
    path.join(REPO_ROOT, "popup.js"),
    "utf8"
  );

  vm.runInNewContext(source, env.context, { filename: "popup.js" });

  const start = env.getDomContentLoadedHandler();
  await start();
  await env.settle();
  await env.flushTimers();
  await env.settle();

  const primaryAction = env.elementsById.get("primary-action");
  assert.equal(primaryAction.textContent, "Connect Phone");

  await primaryAction.onclick();
  assert.deepEqual(
    env.getRuntimeMessages().map((message) => {
      return message.action;
    }),
    ["PREWARM_PAIR_AUTH", "OPEN_PAIR_SURFACE"]
  );
  assert.deepEqual(env.getTabCreateCalls(), []);
});
