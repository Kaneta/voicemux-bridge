(function attachBackgroundRelaySession(globalScope) {
  function createBackgroundRelaySession(deps) {
    let socket = null;
    let heartbeatInterval = null;
    let retryTimer = null;
    let retryDelay = deps.baseRetryDelay;
    let currentRoomId = null;
    let isJoined = false;
    let failedConnectsWithoutJoin = 0;
    let isPurgingAuth = false;
    const remoteDevices = new Map();

    function safeSend(message) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
      }
      return false;
    }

    function stopRelayTimers() {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    }

    function closeSocketQuietly(activeSocket) {
      if (!activeSocket) {
        return;
      }
      try {
        activeSocket.close();
      } catch {
        // best-effort cleanup
      }
    }

    function syncDevicePresence() {
      let mobileCount = 0;
      remoteDevices.forEach((type) => {
        if (type === "mobile") {
          mobileCount++;
        }
      });
      chrome.storage.local.set({
        voicemux_mobile_connected: mobileCount > 0
      });
    }

    function resetRelayConnectionState() {
      socket = null;
      currentRoomId = null;
      isJoined = false;
      failedConnectsWithoutJoin = 0;
      remoteDevices.clear();
      syncDevicePresence();
    }

    function purgeStoredAuth(reason) {
      if (isPurgingAuth) {
        return;
      }
      isPurgingAuth = true;
      deps.appendDebugEvent("purge_auth", { reason, roomId: currentRoomId });
      console.warn("VoiceMux: Purging stale auth from extension.", { reason, roomId: currentRoomId });

      stopRelayTimers();

      const activeSocket = socket;
      resetRelayConnectionState();

      deps.removeAuthStorage(() => {
        isPurgingAuth = false;
      });

      closeSocketQuietly(activeSocket);
    }

    async function connect() {
      if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        deps.appendDebugEvent("connect_skip_existing_socket", {
          readyState: socket.readyState,
          roomId: currentRoomId
        });
        return;
      }

      const data = await deps.readActiveAuthSnapshot();
      if (!data.voicemux_token || !data.voicemux_room_id) {
        deps.appendDebugEvent("connect_skip_missing_auth", {
          hasToken: !!data.voicemux_token,
          hasRoomId: !!data.voicemux_room_id
        });
        return;
      }

      currentRoomId = data.voicemux_room_id;
      remoteDevices.clear();
      syncDevicePresence();
      const topic = `room:${currentRoomId}`;
      deps.appendDebugEvent("connect_start", {
        roomId: currentRoomId,
        retryDelay,
        failedConnectsWithoutJoin
      });
      console.log("VoiceMux: connect_start", {
        roomId: currentRoomId,
        retryDelay,
        failedConnectsWithoutJoin
      });
      socket = new WebSocket(
        `${deps.baseWsUrl}?vsn=2.0.0&token=${encodeURIComponent(data.voicemux_token)}&room=${encodeURIComponent(currentRoomId)}`
      );

      socket.onopen = () => {
        deps.appendDebugEvent("socket_open", { roomId: currentRoomId });
        console.log("VoiceMux: Socket established. Joining room...");
        isJoined = false;
        safeSend([deps.joinRef, deps.joinRef, topic, "phx_join", {}]);
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
        heartbeatInterval = setInterval(() => {
          safeSend([null, "heartbeat", "phoenix", "heartbeat", {}]);
        }, deps.heartbeatIntervalMs);
      };

      const relayRuntimeHandlers = deps.createRelayRuntimeHandlers(
        deps.getRelayCoordinator().createRelayRuntimeDeps(topic)
      );
      socket.onmessage = relayRuntimeHandlers.handleMessage;
      socket.onclose = relayRuntimeHandlers.handleClose;
      socket.onerror = relayRuntimeHandlers.handleError;
    }

    function scheduleReconnect() {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      const reconnectSchedule = deps.computeReconnectSchedule({
        retryDelay,
        maxRetryDelay: deps.maxRetryDelay
      });
      deps.appendDebugEvent("schedule_reconnect", {
        roomId: currentRoomId,
        retryDelay: reconnectSchedule.scheduledDelay
      });
      console.log("VoiceMux: schedule_reconnect", {
        roomId: currentRoomId,
        retryDelay: reconnectSchedule.scheduledDelay
      });
      retryTimer = setTimeout(() => {
        connect();
      }, reconnectSchedule.scheduledDelay);
      retryDelay = reconnectSchedule.nextRetryDelay;
    }

    function clearRemoteDevices() {
      remoteDevices.clear();
    }

    return {
      clearRemoteDevices,
      closeSocketQuietly,
      connect,
      getCurrentRoomId() {
        return currentRoomId;
      },
      getFailedConnectsWithoutJoin() {
        return failedConnectsWithoutJoin;
      },
      getIsJoined() {
        return isJoined;
      },
      getIsPurgingAuth() {
        return isPurgingAuth;
      },
      getSocket() {
        return socket;
      },
      purgeStoredAuth,
      safeSend,
      scheduleReconnect,
      setFailedConnectsWithoutJoin(value) {
        failedConnectsWithoutJoin = value;
      },
      setIsJoined(value) {
        isJoined = value;
      },
      setRetryDelay(value) {
        retryDelay = value;
      },
      syncDevicePresence,
      remoteDevices
    };
  }

  const api = {
    createBackgroundRelaySession
  };

  globalScope.VoiceMuxBackgroundRelaySession = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
