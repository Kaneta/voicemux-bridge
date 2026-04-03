(function attachBackgroundRelayCoordinator(globalScope) {
  function createRelayCoordinator(deps) {
    function createRelayRuntimeDeps(topic) {
      return {
        addRemoteDevice(deviceId, role) {
          deps.remoteDevices.set(deviceId, role);
        },
        appendDebugEvent: deps.appendDebugEvent,
        baseRetryDelay: deps.baseRetryDelay,
        clearRemoteDevices() {
          deps.remoteDevices.clear();
        },
        closeSocketQuietly: deps.closeSocketQuietly,
        decideSocketCloseRecovery: deps.decideSocketCloseRecovery,
        decrypt: deps.decrypt,
        getCurrentRoomId: deps.getCurrentRoomId,
        getFailedConnectsWithoutJoin: deps.getFailedConnectsWithoutJoin,
        getIsJoined: deps.getIsJoined,
        getIsPurgingAuth: deps.getIsPurgingAuth,
        getPresenceRole: deps.getPresenceRole,
        getSocket: deps.getSocket,
        getTopic() {
          return topic;
        },
        handleOpenEditor: deps.handleOpenEditor,
        hasActiveAuth: deps.hasActiveAuth,
        joinRef: deps.joinRef,
        maxFailedConnectsWithoutJoin: deps.maxFailedConnectsWithoutJoin,
        notifyActiveTab: deps.notifyActiveTab,
        purgeStoredAuth: deps.purgeStoredAuth,
        reduceJoinSuccess: deps.reduceJoinSuccess,
        removeRemoteDevice(deviceId) {
          deps.remoteDevices.delete(deviceId);
        },
        safeSend: deps.safeSend,
        scheduleReconnect: deps.scheduleReconnect,
        setFailedConnectsWithoutJoin: deps.setFailedConnectsWithoutJoin,
        setIsJoined: deps.setIsJoined,
        setRetryDelay: deps.setRetryDelay,
        syncDevicePresence: deps.syncDevicePresence
      };
    }

    return {
      createRelayRuntimeDeps
    };
  }

  const api = {
    createRelayCoordinator
  };

  globalScope.VoiceMuxBackgroundRelayCoordinator = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
