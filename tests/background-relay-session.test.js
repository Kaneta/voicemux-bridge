const test = require("node:test");
const assert = require("node:assert/strict");

const { createBackgroundRelaySession } = require("../background-relay-session.js");

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
    FakeWebSocket.instances.push(this);
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }
}

FakeWebSocket.instances = [];

function installRelayGlobals() {
  const originalChrome = global.chrome;
  const originalWebSocket = global.WebSocket;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;

  const timers = [];
  const intervals = [];
  let timerId = 1;
  let intervalId = 1;
  let mobileConnected = null;

  global.chrome = {
    storage: {
      local: {
        set(payload) {
          if (Object.prototype.hasOwnProperty.call(payload, "voicemux_mobile_connected")) {
            mobileConnected = payload.voicemux_mobile_connected;
          }
          return Promise.resolve();
        }
      }
    }
  };
  global.WebSocket = FakeWebSocket;
  global.setTimeout = (fn, _delay) => {
    const id = timerId++;
    timers.push({ id, fn });
    return id;
  };
  global.clearTimeout = (id) => {
    const index = timers.findIndex((timer) => {
      return timer.id === id;
    });
    if (index >= 0) {
      timers.splice(index, 1);
    }
  };
  global.setInterval = (fn, _delay) => {
    const id = intervalId++;
    intervals.push({ id, fn });
    return id;
  };
  global.clearInterval = (id) => {
    const index = intervals.findIndex((interval) => {
      return interval.id === id;
    });
    if (index >= 0) {
      intervals.splice(index, 1);
    }
  };

  FakeWebSocket.instances = [];

  return {
    getMobileConnected() {
      return mobileConnected;
    },
    getTimers() {
      return timers;
    },
    getIntervals() {
      return intervals;
    },
    restore() {
      global.chrome = originalChrome;
      global.WebSocket = originalWebSocket;
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
      FakeWebSocket.instances = [];
    }
  };
}

function createSession(overrides = {}) {
  const debugEvents = [];
  let removedAuth = 0;
  let runtimeTopic = null;
  const session = createBackgroundRelaySession({
    appendDebugEvent(event, detail) {
      debugEvents.push({ event, detail });
    },
    baseRetryDelay: 1000,
    baseWsUrl: "wss://v.knc.jp/socket/websocket",
    computeReconnectSchedule(args) {
      return {
        scheduledDelay: args.retryDelay,
        nextRetryDelay: Math.min(args.retryDelay * 2, args.maxRetryDelay)
      };
    },
    createRelayRuntimeHandlers(deps) {
      runtimeTopic = deps.getTopic();
      return {
        handleClose() {},
        handleError() {},
        handleMessage() {}
      };
    },
    getRelayCoordinator() {
      return {
        createRelayRuntimeDeps(topic) {
          return {
            getTopic() {
              return topic;
            }
          };
        }
      };
    },
    heartbeatIntervalMs: 30000,
    joinRef: "1",
    maxRetryDelay: 30000,
    async readActiveAuthSnapshot() {
      return overrides.authSnapshot || {};
    },
    removeAuthStorage(callback) {
      removedAuth++;
      if (typeof callback === "function") {
        callback();
      }
    }
  });

  return {
    debugEvents,
    getRemovedAuthCount() {
      return removedAuth;
    },
    getRuntimeTopic() {
      return runtimeTopic;
    },
    session
  };
}

test("relay session connect skips when auth is missing", async () => {
  const globals = installRelayGlobals();

  try {
    const { debugEvents, session } = createSession();
    await session.connect();

    assert.equal(FakeWebSocket.instances.length, 0);
    assert.equal(debugEvents.at(-1)?.event, "connect_skip_missing_auth");
  } finally {
    globals.restore();
  }
});

test("relay session connect opens socket and joins the room on open", async () => {
  const globals = installRelayGlobals();

  try {
    const { getRuntimeTopic, session } = createSession({
      authSnapshot: {
        voicemux_room_id: "room-1",
        voicemux_token: "token-1"
      }
    });

    await session.connect();

    assert.equal(FakeWebSocket.instances.length, 1);
    const socket = FakeWebSocket.instances[0];
    assert.match(socket.url, /token=token-1/);
    assert.match(socket.url, /room=room-1/);
    assert.equal(getRuntimeTopic(), "room:room-1");

    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.();

    assert.equal(socket.sent.length, 1);
    assert.equal(
      socket.sent[0],
      JSON.stringify(["1", "1", "room:room-1", "phx_join", {}])
    );

    globals.getIntervals()[0]?.fn();
    assert.equal(socket.sent.length, 2);
    assert.equal(globals.getMobileConnected(), false);
  } finally {
    globals.restore();
  }
});

test("relay session purge resets state, clears presence, and closes the socket", async () => {
  const globals = installRelayGlobals();

  try {
    const { getRemovedAuthCount, session } = createSession({
      authSnapshot: {
        voicemux_room_id: "room-1",
        voicemux_token: "token-1"
      }
    });

    await session.connect();
    session.remoteDevices.set("mobile-1", "mobile");
    session.syncDevicePresence();

    const socket = session.getSocket();
    session.purgeStoredAuth("manual_reset");

    assert.equal(getRemovedAuthCount(), 1);
    assert.equal(socket.closed, true);
    assert.equal(session.getSocket(), null);
    assert.equal(session.getCurrentRoomId(), null);
    assert.equal(session.getIsJoined(), false);
    assert.equal(globals.getMobileConnected(), false);
  } finally {
    globals.restore();
  }
});
