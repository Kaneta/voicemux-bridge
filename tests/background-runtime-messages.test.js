const test = require("node:test");
const assert = require("node:assert/strict");

const { createRuntimeMessageHandler } = require("../background-runtime-messages.js");

function createHandlerEnv(overrides = {}) {
  const debugEvents = [];
  const storedAuthSnapshots = [];
  const safeSendCalls = [];
  const purgeCalls = [];
  let preferredTabId = null;
  let failedConnectsWithoutJoin = 3;
  let clearRemoteDevicesCount = 0;
  let clearPrewarmStorageCount = 0;
  let closeSocketCalls = 0;
  let connectCalls = 0;

  const socket = { id: "socket-1" };

  const handler = createRuntimeMessageHandler({
    appendDebugEvent(event, detail) {
      debugEvents.push({ event, detail });
    },
    clearPrewarmStorage() {
      clearPrewarmStorageCount++;
      return Promise.resolve();
    },
    clearRemoteDevices() {
      clearRemoteDevicesCount++;
    },
    closeSocketQuietly(activeSocket) {
      if (activeSocket) {
        closeSocketCalls++;
      }
    },
    connect() {
      connectCalls++;
    },
    ensurePrewarmedPairAuth() {
      return Promise.resolve(overrides.prewarmPayload || null);
    },
    getCurrentRoomId() {
      return overrides.currentRoomId || "room-1";
    },
    getIsJoined() {
      return overrides.isJoined ?? true;
    },
    getOriginFromUrl(url) {
      return url ? new URL(url).origin : null;
    },
    getSocket() {
      return socket;
    },
    joinRef: "1",
    openOrFocusPairSurface() {
      if (overrides.openPairSurfaceError) {
        return Promise.reject(overrides.openPairSurfaceError);
      }
      return Promise.resolve(
        overrides.openPairSurfacePayload || {
          action: "created_new",
          tabId: 42,
          url: "https://pair.knc.jp/chrome"
        }
      );
    },
    purgeStoredAuth(reason) {
      purgeCalls.push(reason);
    },
    readFreshPrewarm() {
      return Promise.resolve(overrides.freshPrewarmPayload || null);
    },
    readScopedAuthForSender(senderUrl, sendResponse) {
      sendResponse({ senderUrl });
    },
    removeAuthStorage(callback) {
      callback?.();
    },
    safeSend(payload) {
      safeSendCalls.push(payload);
      return true;
    },
    setFailedConnectsWithoutJoin(value) {
      failedConnectsWithoutJoin = value;
    },
    setPreferredTabId(value) {
      preferredTabId = value;
    },
    setStoredAuthSnapshot(args, callback) {
      storedAuthSnapshots.push(args);
      callback?.();
    }
  });

  return {
    debugEvents,
    getClearPrewarmStorageCount() {
      return clearPrewarmStorageCount;
    },
    getClearRemoteDevicesCount() {
      return clearRemoteDevicesCount;
    },
    getCloseSocketCalls() {
      return closeSocketCalls;
    },
    getConnectCalls() {
      return connectCalls;
    },
    getFailedConnectsWithoutJoin() {
      return failedConnectsWithoutJoin;
    },
    getPreferredTabId() {
      return preferredTabId;
    },
    handler,
    purgeCalls,
    safeSendCalls,
    storedAuthSnapshots
  };
}

test("TARGET_FOCUS stores the sender tab id and responds synchronously", () => {
  const env = createHandlerEnv();
  let response = null;

  const handledAsync = env.handler(
    {
      action: "TARGET_FOCUS",
      tag: "primary",
      role: "editor"
    },
    {
      tab: {
        id: 123,
        url: "https://example.com"
      }
    },
    (payload) => {
      response = payload;
    }
  );

  assert.equal(handledAsync, false);
  assert.equal(env.getPreferredTabId(), 123);
  assert.deepEqual(response, { success: true });
  assert.equal(env.debugEvents.at(-1)?.event, "target_focus");
});

test("SYNC_AUTH stores cleaned auth, clears retry state, and reconnects", async () => {
  const env = createHandlerEnv();
  let response = null;

  const handledAsync = env.handler(
    {
      action: "SYNC_AUTH",
      uuid: "room-2",
      token: "token-2",
      key: "ab cd",
      hub_url: "https://hub.knc.jp"
    },
    {
      url: "https://pair.knc.jp/chrome"
    },
    (payload) => {
      response = payload;
    }
  );

  await Promise.resolve();

  assert.equal(handledAsync, true);
  assert.deepEqual(env.storedAuthSnapshots, [
    {
      uuid: "room-2",
      token: "token-2",
      key: "ab+cd",
      hubUrl: "https://hub.knc.jp",
      pairOrigin: "https://pair.knc.jp"
    }
  ]);
  assert.equal(env.getClearRemoteDevicesCount(), 1);
  assert.equal(env.getClearPrewarmStorageCount(), 1);
  assert.equal(env.getFailedConnectsWithoutJoin(), 0);
  assert.equal(env.getCloseSocketCalls(), 1);
  assert.equal(env.getConnectCalls(), 1);
  assert.deepEqual(response, { success: true });
});

test("RESET_ROOM sends remote reset before purging when joined", () => {
  const env = createHandlerEnv({
    currentRoomId: "room-9",
    isJoined: true
  });
  let response = null;

  const handledAsync = env.handler(
    { action: "RESET_ROOM" },
    {},
    (payload) => {
      response = payload;
    }
  );

  assert.equal(handledAsync, true);
  assert.deepEqual(env.safeSendCalls, [
    [
      "1",
      "9",
      "room:room-9",
      "remote_command",
      {
        action: "RESET_ROOM",
        sender_tab_id: "extension",
        role: "extension"
      }
    ]
  ]);
  assert.deepEqual(env.purgeCalls, ["manual_reset"]);
  assert.deepEqual(response, { success: true });
});

test("OPEN_PAIR_SURFACE responds with success payload", async () => {
  const env = createHandlerEnv({
    openPairSurfacePayload: {
      action: "focused_existing",
      tabId: 55,
      url: "https://pair.knc.jp/chrome/abc"
    }
  });
  let response = null;

  const handledAsync = env.handler(
    { action: "OPEN_PAIR_SURFACE" },
    {},
    (payload) => {
      response = payload;
    }
  );

  await Promise.resolve();

  assert.equal(handledAsync, true);
  assert.deepEqual(response, {
    success: true,
    action: "focused_existing",
    tabId: 55,
    url: "https://pair.knc.jp/chrome/abc"
  });
});
