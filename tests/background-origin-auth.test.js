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
  let onInstalled = null;
  let onStartup = null;
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
      onInstalled: {
        addListener(listener) {
          onInstalled = listener;
        }
      },
      onStartup: {
        addListener(listener) {
          onStartup = listener;
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
    importScripts(...paths) {
      paths.forEach((relativePath) => {
        const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
        vm.runInNewContext(source, context, { filename: relativePath });
      });
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
    async runInstalled(reason = "update") {
      if (!onInstalled) {
        return false;
      }
      await onInstalled({ reason });
      return true;
    },
    async runStartup() {
      if (!onStartup) {
        return false;
      }
      await onStartup();
      return true;
    },
    async flushAsyncWork() {
      await Promise.resolve();
      await Promise.resolve();
    },
    storage,
    getSockets() {
      return sockets;
    },
    getTimerCount() {
      return timers.length;
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

test("startup wake clears stale mobile presence even when no auth is stored", async () => {
  const env = createBackgroundEnvironment({
    voicemux_mobile_connected: true
  });

  await env.runStartup();
  await env.flushAsyncWork();

  assert.equal(env.storage.snapshot().voicemux_mobile_connected, false);
});

test("runtime startup re-normalizes stored mobile presence", async () => {
  const env = createBackgroundEnvironment({
    voicemux_mobile_connected: true
  });

  env.storage.set({ voicemux_mobile_connected: true });
  await env.runStartup();
  await env.flushAsyncWork();

  assert.equal(env.storage.snapshot().voicemux_mobile_connected, false);
});

test("runtime wake with auth attempts reconnect", async () => {
  const env = createBackgroundEnvironment({
    voicemux_room_id: "room-1",
    voicemux_token: "token-1",
    voicemux_key: "key-1",
    voicemux_mobile_connected: true
  });

  await env.runStartup();
  await env.flushAsyncWork();

  assert.equal(env.getSockets().length, 2);
  const latestSocket = env.getSockets()[env.getSockets().length - 1];
  assert.match(latestSocket.url, /token=token-1/);
  assert.match(latestSocket.url, /room=room-1/);
  assert.equal(env.storage.snapshot().voicemux_mobile_connected, false);
});

test("socket close before join retries once then purges auth", async () => {
  const env = createBackgroundEnvironment({
    voicemux_room_id: "room-1",
    voicemux_token: "token-1",
    voicemux_key: "key-1"
  });

  await env.runStartup();
  await env.flushAsyncWork();
  const [firstSocket] = env.getSockets();
  await firstSocket.onclose?.({ code: 1006, wasClean: false, reason: "" });
  await env.flushAsyncWork();

  assert.equal(env.getTimerCount(), 1);
  assert.equal(env.storage.snapshot().voicemux_room_id, "room-1");

  await env.runNextTimer();
  await env.flushAsyncWork();
  const socketsAfterRetry = env.getSockets();
  const secondSocket = socketsAfterRetry[socketsAfterRetry.length - 1];
  await secondSocket.onclose?.({ code: 1006, wasClean: false, reason: "" });

  const snapshot = env.storage.snapshot();
  assert.equal(snapshot.voicemux_room_id, undefined);
  assert.equal(snapshot.voicemux_token, undefined);
  assert.equal(snapshot.voicemux_key, undefined);
});

test("join success keeps auth and schedules reconnect on later close", async () => {
  const env = createBackgroundEnvironment({
    voicemux_room_id: "room-1",
    voicemux_token: "token-1",
    voicemux_key: "key-1"
  });

  await env.runStartup();
  await env.flushAsyncWork();
  const [socket] = env.getSockets();
  socket.readyState = FakeWebSocket.OPEN;
  socket.onopen?.();
  socket.onmessage?.({
    data: JSON.stringify([
      "1",
      "1",
      "room:room-1",
      "phx_reply",
      { status: "ok", response: {} }
    ])
  });

  await socket.onclose?.({ code: 1006, wasClean: false, reason: "" });
  await env.flushAsyncWork();

  assert.equal(env.storage.snapshot().voicemux_room_id, "room-1");
  assert.equal(env.getTimerCount(), 1);
});

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
