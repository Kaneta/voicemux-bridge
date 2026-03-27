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
    "btn-global-reset",
    "guide-link",
    "maintenance-notice",
    "maintenance-link"
  ];

  const elementsById = new Map();
  ids.forEach((id) => {
    return elementsById.set(id, new FakeElement({ id }));
  });
  elementsById.get("btn-global-reset").tagName = "BUTTON";
  elementsById.get("primary-action").tagName = "BUTTON";
  elementsById.get("guide-link").tagName = "A";
  elementsById.get("maintenance-link").tagName = "A";

  const localized = [
    new FakeElement({ tagName: "H1", attributes: { "data-i18n": "name" } }),
    new FakeElement({
      id: "btn-global-reset",
      tagName: "BUTTON",
      attributes: { "data-i18n": "btn_reset_connection" }
    }),
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
    voicemux_hub_url: "https://hub.knc.jp",
    voicemux_pair_url: "https://pair.knc.jp",
    voicemux_mobile_connected: true,
    voicemux_paired: true,
    voicemux_pairing_code: "PAIR-1"
  };

  const tabCreateCalls = [];
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
    confirm_reset: "Reset room?",
    mobile_ready_title: "You can input text into websites on this PC from your smartphone.",
    mobile_ready_copy: "You can close this popup and keep using it. Open VoiceMuxHub only when you want to polish the text.",
    mobile_connected_note: "",
    mobile_connecting_note: "Phone presence is still being confirmed. If it already works, you can keep using voice input. Open VoiceMuxHub only when you want to polish the text.",
    btn_manage_librarian: "Open VoiceMuxHub",
    waiting_hub_main: "Connect your phone",
    btn_open_pair_surface: "Connect Phone"
  };

  const chrome = {
    i18n: {
      getMessage(key) {
        return messages[key] || "";
      }
    },
    runtime: {
      getManifest() {
        return { version: "2.2.0" };
      },
      async sendMessage(payload) {
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

test("reset room returns popup to disconnected state without auto-opening /pair", async () => {
  const env = createPopupEnvironment();
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

  const resetButton = env.elementsById.get("btn-global-reset");
  const primaryAction = env.elementsById.get("primary-action");
  const title = env.elementsById.get("content-title");

  assert.equal(typeof resetButton.onclick, "function");
  assert.equal(env.getTabCreateCalls().length, 0);

  await resetButton.onclick();
  await env.settle();
  await env.flushTimers();
  await env.settle();

  assert.equal(title.textContent, "");
  assert.equal(primaryAction.textContent, "Connect Phone");
  assert.deepEqual(env.getTabCreateCalls(), [], "popup must not auto-open /pair after Reset Room");
});

test("popup keeps a single auth-ready state while mobile presence is still being confirmed", async () => {
  const env = createPopupEnvironment();
  env.setStorage({
    voicemux_room_id: "room-1",
    voicemux_token: "token-1",
    voicemux_key: "key-1",
    voicemux_hub_url: "https://hub.knc.jp",
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
  const resetButton = env.elementsById.get("btn-global-reset");

  assert.equal(contentTitle.textContent, "You can input text into websites on this PC from your smartphone.");
  assert.equal(
    contentCopy.textContent,
    "You can close this popup and keep using it. Open VoiceMuxHub only when you want to polish the text."
  );
  assert.equal(primaryAction.textContent, "Open VoiceMuxHub");
  assert.equal(primaryNote.textContent, "");
  assert.equal(resetButton.classList.contains("is-hidden"), false);
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
  assert.deepEqual(env.getTabCreateCalls(), ["https://pair.knc.jp/hub"]);
});
