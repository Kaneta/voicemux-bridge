const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeReconnectSchedule,
  decideSocketCloseRecovery,
  reduceJoinSuccess,
  reduceRuntimeWake
} = require("../background-connection-logic.js");

test("socket close recovery ignores closes during auth purge", () => {
  assert.deepEqual(
    decideSocketCloseRecovery({
      isPurgingAuth: true,
      hasActiveAuth: true,
      failedConnectsWithoutJoin: 1,
      maxFailedConnectsWithoutJoin: 2
    }),
    {
      action: "ignore",
      nextFailedConnectsWithoutJoin: 1
    }
  );
});

test("socket close recovery skips reconnect when auth is gone", () => {
  assert.deepEqual(
    decideSocketCloseRecovery({
      isPurgingAuth: false,
      hasActiveAuth: false,
      failedConnectsWithoutJoin: 0,
      maxFailedConnectsWithoutJoin: 2
    }),
    {
      action: "skip_no_auth",
      nextFailedConnectsWithoutJoin: 0
    }
  );
});

test("socket close recovery purges auth after repeated failed joins", () => {
  assert.deepEqual(
    decideSocketCloseRecovery({
      isPurgingAuth: false,
      hasActiveAuth: true,
      failedConnectsWithoutJoin: 1,
      maxFailedConnectsWithoutJoin: 2
    }),
    {
      action: "purge_auth",
      nextFailedConnectsWithoutJoin: 2
    }
  );
});

test("socket close recovery schedules reconnect before the purge threshold", () => {
  assert.deepEqual(
    decideSocketCloseRecovery({
      isPurgingAuth: false,
      hasActiveAuth: true,
      failedConnectsWithoutJoin: 0,
      maxFailedConnectsWithoutJoin: 2
    }),
    {
      action: "schedule_reconnect",
      nextFailedConnectsWithoutJoin: 1
    }
  );
});

test("reconnect schedule doubles delay up to the cap", () => {
  assert.deepEqual(
    computeReconnectSchedule({
      retryDelay: 5000,
      maxRetryDelay: 30000
    }),
    {
      scheduledDelay: 5000,
      nextRetryDelay: 10000
    }
  );

  assert.deepEqual(
    computeReconnectSchedule({
      retryDelay: 30000,
      maxRetryDelay: 30000
    }),
    {
      scheduledDelay: 30000,
      nextRetryDelay: 30000
    }
  );
});

test("join success normalization resets retry state to the base delay", () => {
  assert.deepEqual(
    reduceJoinSuccess({
      baseRetryDelay: 1000
    }),
    {
      isJoined: true,
      failedConnectsWithoutJoin: 0,
      retryDelay: 1000
    }
  );
});

test("runtime wake always clears remote presence and connects only when auth exists", () => {
  assert.deepEqual(
    reduceRuntimeWake({
      hasActiveAuth: true
    }),
    {
      clearRemotePresence: true,
      shouldConnect: true
    }
  );

  assert.deepEqual(
    reduceRuntimeWake({
      hasActiveAuth: false
    }),
    {
      clearRemotePresence: true,
      shouldConnect: false
    }
  );
});
