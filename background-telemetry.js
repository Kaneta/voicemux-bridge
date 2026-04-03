(function attachBackgroundTelemetry(globalScope) {
  function createBackgroundTelemetry(deps) {
    function appendDebugEvent(event, detail = {}) {
      const entry = {
        ts: new Date().toISOString(),
        source: "background",
        event,
        detail
      };

      chrome.storage.local.get(deps.debugLogKey, (data) => {
        const existing = Array.isArray(data[deps.debugLogKey]) ? data[deps.debugLogKey] : [];
        const next = [...existing.slice(-(deps.debugLogLimit - 1)), entry];
        chrome.storage.local.set({ [deps.debugLogKey]: next });
      });
    }

    return {
      appendDebugEvent
    };
  }

  const api = {
    createBackgroundTelemetry
  };

  globalScope.VoiceMuxBackgroundTelemetry = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
