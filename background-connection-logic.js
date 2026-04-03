(function attachBackgroundConnectionLogic(globalScope) {
  function decideSocketCloseRecovery(args) {
    if (args.isPurgingAuth) {
      return {
        action: "ignore",
        nextFailedConnectsWithoutJoin: args.failedConnectsWithoutJoin
      };
    }

    if (!args.hasActiveAuth) {
      return {
        action: "skip_no_auth",
        nextFailedConnectsWithoutJoin: args.failedConnectsWithoutJoin
      };
    }

    const nextFailedConnectsWithoutJoin = args.failedConnectsWithoutJoin + 1;
    if (nextFailedConnectsWithoutJoin >= args.maxFailedConnectsWithoutJoin) {
      return {
        action: "purge_auth",
        nextFailedConnectsWithoutJoin
      };
    }

    return {
      action: "schedule_reconnect",
      nextFailedConnectsWithoutJoin
    };
  }

  function computeReconnectSchedule(args) {
    return {
      scheduledDelay: args.retryDelay,
      nextRetryDelay: Math.min(args.retryDelay * 2, args.maxRetryDelay)
    };
  }

  function reduceJoinSuccess(args) {
    return {
      isJoined: true,
      failedConnectsWithoutJoin: 0,
      retryDelay: args.baseRetryDelay
    };
  }

  function reduceRuntimeWake(args) {
    return {
      clearRemotePresence: true,
      shouldConnect: args.hasActiveAuth
    };
  }

  const api = {
    computeReconnectSchedule,
    decideSocketCloseRecovery,
    reduceJoinSuccess,
    reduceRuntimeWake
  };

  globalScope.VoiceMuxBackgroundConnectionLogic = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
