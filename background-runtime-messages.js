(function attachBackgroundRuntimeMessages(globalScope) {
  function createRuntimeMessageHandler(deps) {
    const actionHandlers = {
      TARGET_FOCUS(request, sender, sendResponse) {
        deps.setPreferredTabId(sender?.tab?.id || null);
        deps.appendDebugEvent("target_focus", {
          tabId: sender?.tab?.id || null,
          url: sender?.tab?.url || null,
          tag: request.tag || null,
          role: request.role || null
        });
        if (typeof sendResponse === "function") {
          sendResponse({ success: true });
        }
        return false;
      },
      SYNC_AUTH(request, sender, sendResponse) {
        const data = request.payload || request;
        const cleanKey = (data.key || "").replace(/ /g, "+");
        const pairOrigin = deps.getOriginFromUrl(sender?.url);
        deps.clearRemoteDevices();
        deps.appendDebugEvent("sync_auth", {
          uuid: data.uuid || null,
          hasToken: !!data.token,
          hasKey: !!cleanKey,
          hubUrl: data.hub_url || sender?.url || null,
          pairOrigin
        });
        deps.setStoredAuthSnapshot(
          {
            uuid: data.uuid,
            token: data.token,
            key: cleanKey,
            hubUrl: data.hub_url || sender?.url,
            pairOrigin
          },
          () => {
            void deps.clearPrewarmStorage();
            deps.setFailedConnectsWithoutJoin(0);
            deps.closeSocketQuietly(deps.getSocket());
            deps.connect();
            if (typeof sendResponse === "function") {
              sendResponse({ success: true });
            }
          }
        );
        return true;
      },
      GET_AUTH(_request, sender, sendResponse) {
        deps.readScopedAuthForSender(sender?.url, sendResponse);
        return true;
      },
      CLEAR_AUTH(_request, _sender, sendResponse) {
        deps.appendDebugEvent("clear_auth");
        deps.clearRemoteDevices();
        deps.removeAuthStorage(() => {
          console.log("VoiceMux: Auth cleared from extension.");
          deps.closeSocketQuietly(deps.getSocket());
          if (typeof sendResponse === "function") {
            sendResponse({ success: true });
          }
        });
        return true;
      },
      RESET_ROOM(_request, _sender, sendResponse) {
        deps.appendDebugEvent("reset_room");
        console.log("VoiceMux: reset_room", {
          roomId: deps.getCurrentRoomId(),
          isJoined: deps.getIsJoined()
        });

        const currentRoomId = deps.getCurrentRoomId();
        const topic = currentRoomId ? `room:${currentRoomId}` : null;
        if (topic && deps.getIsJoined()) {
          deps.safeSend([
            deps.joinRef,
            "9",
            topic,
            "remote_command",
            {
              action: "RESET_ROOM",
              sender_tab_id: "extension",
              role: "extension"
            }
          ]);
        }

        deps.purgeStoredAuth("manual_reset");
        if (typeof sendResponse === "function") {
          sendResponse({ success: true });
        }
        return true;
      },
      PREWARM_PAIR_AUTH(_request, _sender, sendResponse) {
        deps.ensurePrewarmedPairAuth().then((payload) => {
          if (typeof sendResponse === "function") {
            sendResponse(payload || { success: false });
          }
        });
        return true;
      },
      GET_PREWARM_PAIR_AUTH(_request, _sender, sendResponse) {
        deps.readFreshPrewarm().then((payload) => {
          if (typeof sendResponse === "function") {
            sendResponse(payload || { success: false });
          }
        });
        return true;
      },
      OPEN_PAIR_SURFACE(_request, _sender, sendResponse) {
        deps.openOrFocusPairSurface()
          .then((payload) => {
            if (typeof sendResponse === "function") {
              sendResponse({ success: true, ...payload });
            }
          })
          .catch((error) => {
            console.warn("VoiceMux: Failed to open pair surface.", error);
            if (typeof sendResponse === "function") {
              sendResponse({ success: false });
            }
          });
        return true;
      }
    };

    return function handleRuntimeMessage(request, sender, sendResponse) {
      const action = request?.action;
      const handler = actionHandlers[action];
      if (!handler) {
        return false;
      }
      return handler(request, sender, sendResponse);
    };
  }

  const api = {
    createRuntimeMessageHandler
  };

  globalScope.VoiceMuxBackgroundRuntimeMessages = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
