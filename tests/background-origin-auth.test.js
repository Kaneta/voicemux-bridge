const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO_ROOT = path.resolve(__dirname, "..");

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }
}

function createStorageArea(initialData = {}) {
  let storageData = { ...initialData };

  function pick(keys) {
    if (Array.isArray(keys)) {
      const result = {};
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(storageData, key)) {
          result[key] = storageData[key];
        }
      });
      return result;
    }

    if (typeof keys === "string") {
      return Object.prototype.hasOwnProperty.call(storageData, keys)
        ? { [keys]: storageData[keys] }
        : {};
    }

    return { ...storageData };
  }

  return {
    get(keys, callback) {
      const result = pick(keys);
      if (typeof callback === "function") {
        callback(result);
        return;
      }
      return Promise.resolve(result);
    },
    set(payload, callback) {
      storageData = { ...storageData, ...payload };
      if (typeof callback === "function") {
        callback();
        return;
      }
      return Promise.resolve();
    },
    remove(keys, callback) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => {
        delete storageData[key];
      });
      if (typeof callback === "function") {
        callback();
        return;
      }
      return Promise.resolve();
    },
    snapshot() {
      return { ...storageData };
    }
  };
}

function createBackgroundEnvironment(initialStorage = {}) {
  const storage = createStorageArea(initialStorage);
  let onMessageExternal = null;
  const sockets = [];
  const timers = [];
  let timerId = 1;

  class TrackedWebSocket extends FakeWebSocket {
    constructor(url) {
      super(url);
      sockets.push(this);
    }
  }

  const chrome = {
    runtime: {
      onMessage: {
        addListener() {}
      },
      onMessageExternal: {
        addListener(listener) {
          onMessageExternal = listener;
        }
      },
      lastError: null
    },
    storage: {
      local: storage
    },
    tabs: {
      query(_queryInfo, callback) {
        callback([]);
      },
      create(_props, callback) {
        callback(null);
      },
      update(_tabId, _props, callback) {
        callback(null);
      },
      get(_tabId, callback) {
        callback(null);
      },
      sendMessage() {
        return Promise.resolve();
      },
      onRemoved: {
        addListener() {}
      }
    },
    windows: {
      update(_windowId, _props, callback) {
        callback(null);
      }
    }
  };

  const context = {
    chrome,
    console,
    URL,
    WebSocket: TrackedWebSocket,
    fetch: async () => {
      throw new Error("unexpected fetch");
    },
    crypto: {
      getRandomValues(array) {
        return array.fill(1);
      },
      subtle: {
        importKey: async () => {
          return {};
        },
        decrypt: async () => {
          return new Uint8Array();
        }
      }
    },
    TextDecoder,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    setTimeout(fn) {
      const id = timerId++;
      timers.push({ id, fn });
      return id;
    },
    clearTimeout(id) {
      const index = timers.findIndex((timer) => {
        return timer.id === id;
      });
      if (index >= 0) {
        timers.splice(index, 1);
      }
    },
    atob(input) {
      return Buffer.from(input, "base64").toString("binary");
    },
    btoa(input) {
      return Buffer.from(input, "binary").toString("base64");
    }
  };

  const source = fs.readFileSync(path.join(REPO_ROOT, "background.js"), "utf8");
  vm.runInNewContext(source, context, { filename: "background.js" });

  return {
    async sendExternalMessage(request, senderUrl) {
      return await new Promise((resolve) => {
        onMessageExternal(request, { url: senderUrl }, (response) => {
          resolve(response);
        });
      });
    },
    storage,
    getSockets() {
      return sockets;
    },
    async runNextTimer() {
      const nextTimer = timers.shift();
      if (!nextTimer) {
        return false;
      }
      await nextTimer.fn();
      return true;
    }
  };
}

test("SYNC_AUTH stores the sender pair origin and GET_AUTH returns auth for the same origin", async () => {
  const env = createBackgroundEnvironment();

  const syncResponse = await env.sendExternalMessage(
    {
      action: "SYNC_AUTH",
      uuid: "room-staging",
      token: "token-staging",
      key: "key-staging",
      hub_url: "https://hub.knc.jp"
    },
    "https://staging-pair.knc.jp/chrome"
  );

  assert.equal(syncResponse.success, true);

  const stored = env.storage.snapshot();
  assert.equal(stored.voicemux_pair_origin, "https://staging-pair.knc.jp");

  const authResponse = await env.sendExternalMessage(
    { action: "GET_AUTH" },
    "https://staging-pair.knc.jp/chrome"
  );

  assert.equal(
    JSON.stringify(authResponse),
    JSON.stringify({
      token: "token-staging",
      uuid: "room-staging",
      key: "key-staging"
    })
  );
});

test("GET_AUTH hides stored auth when the sender origin does not match", async () => {
  const env = createBackgroundEnvironment({
    voicemux_token: "token-prod",
    voicemux_room_id: "room-prod",
    voicemux_key: "key-prod",
    voicemux_pair_origin: "https://pair.knc.jp"
  });

  const authResponse = await env.sendExternalMessage(
    { action: "GET_AUTH" },
    "https://staging-pair.knc.jp/chrome"
  );

  assert.equal(JSON.stringify(authResponse), JSON.stringify({}));
});
