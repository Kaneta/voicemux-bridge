(function attachBackgroundRelayRuntime(globalScope) {
  function createRelayRuntimeHandlers(deps) {
    async function handleMessage(event) {
      const topic = deps.getTopic();
      const [, , msgTopic, eventName, payload] = JSON.parse(event.data);
      if (msgTopic !== topic) {
        return;
      }

      if (payload && payload.ciphertext) {
        const plaintext = await deps.decrypt(payload);
        if (plaintext) {
          if (plaintext === "[Key Mismatch]" || plaintext === "[Decryption Error]") {
            deps.purgeStoredAuth("decrypt_failure");
            return;
          }
          payload.plaintext = plaintext;
        }
      }

      deps.notifyActiveTab(payload, eventName);

      if (eventName === "remote_command" && payload.action === "OPEN_EDITOR") {
        deps.handleOpenEditor(deps.getCurrentRoomId());
      }

      if (eventName === "phx_reply" && payload?.status === "ok") {
        const joinSuccess = deps.reduceJoinSuccess({
          baseRetryDelay: deps.baseRetryDelay
        });
        deps.appendDebugEvent("join_ok", {
          roomId: deps.getCurrentRoomId(),
          ref: payload?.response?.ref || null
        });
        console.log("VoiceMux: Channel Joined Successfully.");
        deps.setIsJoined(joinSuccess.isJoined);
        deps.setFailedConnectsWithoutJoin(joinSuccess.failedConnectsWithoutJoin);
        deps.setRetryDelay(joinSuccess.retryDelay);
        deps.syncDevicePresence();
        deps.safeSend([
          deps.joinRef,
          "2",
          topic,
          "device_online",
          { sender_tab_id: "extension", role: "extension" }
        ]);
        return;
      }

      if (eventName === "device_online" && payload.sender_tab_id !== "extension") {
        if (deps.getIsJoined()) {
          deps.addRemoteDevice(payload.sender_tab_id, deps.getPresenceRole(payload) || "unknown");
          deps.syncDevicePresence();
          chrome.storage.local.set({ voicemux_paired: true });
        }
        return;
      }

      if (eventName === "device_offline" && payload.sender_tab_id !== "extension") {
        deps.removeRemoteDevice(payload.sender_tab_id);
        deps.syncDevicePresence();
      }
    }

    async function handleClose(event) {
      deps.appendDebugEvent("socket_close", {
        roomId: deps.getCurrentRoomId(),
        code: event.code,
        wasClean: event.wasClean,
        reason: event.reason || null,
        isPurgingAuth: deps.getIsPurgingAuth(),
        isJoined: deps.getIsJoined(),
        failedConnectsWithoutJoin: deps.getFailedConnectsWithoutJoin()
      });
      console.log("VoiceMux: socket_close", {
        roomId: deps.getCurrentRoomId(),
        code: event.code,
        wasClean: event.wasClean,
        reason: event.reason || null,
        isPurgingAuth: deps.getIsPurgingAuth(),
        isJoined: deps.getIsJoined(),
        failedConnectsWithoutJoin: deps.getFailedConnectsWithoutJoin()
      });
      if (deps.getIsPurgingAuth()) {
        return;
      }

      deps.setIsJoined(false);
      deps.clearRemoteDevices();
      deps.syncDevicePresence();

      const closeRecovery = deps.decideSocketCloseRecovery({
        isPurgingAuth: deps.getIsPurgingAuth(),
        hasActiveAuth: await deps.hasActiveAuth(),
        failedConnectsWithoutJoin: deps.getFailedConnectsWithoutJoin(),
        maxFailedConnectsWithoutJoin: deps.maxFailedConnectsWithoutJoin
      });
      deps.setFailedConnectsWithoutJoin(closeRecovery.nextFailedConnectsWithoutJoin);

      if (closeRecovery.action === "skip_no_auth") {
        deps.appendDebugEvent("socket_close_skip_reconnect_no_auth", {
          roomId: deps.getCurrentRoomId()
        });
        console.log("VoiceMux: socket_close_skip_reconnect_no_auth", {
          roomId: deps.getCurrentRoomId()
        });
        return;
      }

      if (closeRecovery.action === "purge_auth") {
        deps.purgeStoredAuth("socket_failed_before_join");
        return;
      }

      if (closeRecovery.action === "schedule_reconnect") {
        deps.scheduleReconnect();
      }
    }

    function handleError(event) {
      deps.appendDebugEvent("socket_error", {
        roomId: deps.getCurrentRoomId(),
        failedConnectsWithoutJoin: deps.getFailedConnectsWithoutJoin()
      });
      console.warn("VoiceMux: socket_error", {
        roomId: deps.getCurrentRoomId(),
        failedConnectsWithoutJoin: deps.getFailedConnectsWithoutJoin(),
        type: event?.type || null
      });
      deps.closeSocketQuietly(deps.getSocket());
    }

    return {
      handleMessage,
      handleClose,
      handleError
    };
  }

  const api = {
    createRelayRuntimeHandlers
  };

  globalScope.VoiceMuxBackgroundRelayRuntime = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
