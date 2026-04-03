(function attachBackgroundAuthState(globalScope) {
  function createBackgroundAuthState(deps) {
    let prewarmPromise = null;

    async function getPairOrigin() {
      const data = await chrome.storage.local.get(["voicemux_pair_url"]);
      try {
        return new URL(data.voicemux_pair_url || "https://pair.knc.jp").origin;
      } catch {
        return "https://pair.knc.jp";
      }
    }

    function getOriginFromUrl(input) {
      if (typeof input !== "string" || input.length === 0) {
        return null;
      }
      try {
        return new URL(input).origin;
      } catch {
        return null;
      }
    }

    function getPrewarmStorage() {
      return chrome.storage.local.get(deps.prewarmStorageKeys);
    }

    function clearPrewarmStorage() {
      return chrome.storage.local.remove(deps.prewarmStorageKeys);
    }

    async function readFreshPrewarm() {
      const data = await getPrewarmStorage();
      const createdAt = Number(data.voicemux_prewarm_created_at || 0);
      const isFresh = createdAt > 0 && Date.now() - createdAt < deps.prewarmTtlMs;
      if (!isFresh) {
        await clearPrewarmStorage();
        return null;
      }
      if (!data.voicemux_prewarm_uuid || !data.voicemux_prewarm_token || !data.voicemux_prewarm_key) {
        await clearPrewarmStorage();
        return null;
      }
      return {
        uuid: data.voicemux_prewarm_uuid,
        token: data.voicemux_prewarm_token,
        key: data.voicemux_prewarm_key
      };
    }

    async function ensurePrewarmedPairAuth() {
      if (prewarmPromise) {
        return prewarmPromise;
      }

      prewarmPromise = (async () => {
        const active = await chrome.storage.local.get(deps.activeAuthStorageKeys);
        if (active.voicemux_room_id && active.voicemux_token && active.voicemux_key) {
          return null;
        }

        const existing = await readFreshPrewarm();
        if (existing) {
          deps.appendDebugEvent("prewarm_reuse", { uuid: existing.uuid });
          return existing;
        }

        const room = await deps.issueFreshSession();
        if (!room.uuid || !room.token) {
          throw new Error("invalid_prewarm_issue_response");
        }

        const key = deps.generateEncryptionKey();
        await chrome.storage.local.set({
          voicemux_prewarm_uuid: room.uuid,
          voicemux_prewarm_token: room.token,
          voicemux_prewarm_key: key,
          voicemux_prewarm_created_at: Date.now()
        });
        deps.appendDebugEvent("prewarm_created", { uuid: room.uuid });
        return { uuid: room.uuid, token: room.token, key };
      })()
        .catch((error) => {
          deps.appendDebugEvent("prewarm_failed", {
            message: error instanceof Error ? error.message : String(error)
          });
          return null;
        })
        .finally(() => {
          prewarmPromise = null;
        });

      return prewarmPromise;
    }

    async function readActiveAuthSnapshot() {
      return chrome.storage.local.get(deps.activeAuthStorageKeys);
    }

    function removeAuthStorage(callback) {
      chrome.storage.local.remove(deps.authResetStorageKeys, callback);
    }

    function setStoredAuthSnapshot(args, callback) {
      chrome.storage.local.set(
        {
          voicemux_token: args.token,
          voicemux_room_id: args.uuid,
          voicemux_key: args.key,
          voicemux_mobile_connected: false,
          voicemux_hub_url: args.hubUrl,
          voicemux_pair_origin: args.pairOrigin
        },
        callback
      );
    }

    function readScopedAuthForSender(senderUrl, sendResponse) {
      deps.appendDebugEvent("get_auth");
      chrome.storage.local.get(deps.activeAuthWithOriginKeys, (data) => {
        const senderOrigin = getOriginFromUrl(senderUrl);
        const storedPairOrigin = getOriginFromUrl(data.voicemux_pair_origin);
        const hasOriginMismatch =
          !!senderOrigin && !!storedPairOrigin && senderOrigin !== storedPairOrigin;

        if (typeof sendResponse !== "function") {
          return;
        }

        if (hasOriginMismatch) {
          deps.appendDebugEvent("get_auth_origin_mismatch", {
            senderOrigin,
            storedPairOrigin
          });
          sendResponse({});
          return;
        }

        sendResponse({
          token: data.voicemux_token,
          uuid: data.voicemux_room_id,
          key: data.voicemux_key
        });
      });
    }

    async function hasActiveAuth() {
      const data = await readActiveAuthSnapshot();
      return !!(data.voicemux_token && data.voicemux_room_id);
    }

    return {
      clearPrewarmStorage,
      ensurePrewarmedPairAuth,
      getOriginFromUrl,
      getPairOrigin,
      hasActiveAuth,
      readActiveAuthSnapshot,
      readFreshPrewarm,
      readScopedAuthForSender,
      removeAuthStorage,
      setStoredAuthSnapshot
    };
  }

  const api = {
    createBackgroundAuthState
  };

  globalScope.VoiceMuxBackgroundAuthState = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
