const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO_ROOT = path.resolve(__dirname, "..");

class FakeElement {
  constructor({ id = null, tagName = "DIV", attributes = {} } = {}) {
    this.id = id;
    this.tagName = tagName;
    this.attributes = { ...attributes };
    this.textContent = "";
    this.innerHTML = "";
    this.placeholder = "";
    this.value = "";
    this.style = {};
    this.listeners = new Map();
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(event, handler) {
    this.listeners.set(event, handler);
  }

  async click() {
    const handler = this.listeners.get("click");
    if (handler) {
      await handler();
    }
  }
}

function createOptionsEnvironment() {
  const elementsById = new Map([
    ["custom-adapters", new FakeElement({ id: "custom-adapters", tagName: "TEXTAREA" })],
    ["pair-url", new FakeElement({ id: "pair-url", tagName: "INPUT" })],
    ["hub-url", new FakeElement({ id: "hub-url", tagName: "INPUT" })],
    ["save", new FakeElement({ id: "save", tagName: "BUTTON" })],
    ["status", new FakeElement({ id: "status" })]
  ]);

  const localized = [
    new FakeElement({ tagName: "H2", attributes: { "data-i18n": "options_operator_header" } }),
    new FakeElement({ tagName: "LABEL", attributes: { "data-i18n": "options_pair_url_label" } }),
    new FakeElement({ tagName: "LABEL", attributes: { "data-i18n": "options_hub_url_label" } }),
    elementsById.get("custom-adapters"),
    elementsById.get("save"),
    elementsById.get("status")
  ];
  elementsById.get("custom-adapters").attributes["data-i18n"] = "options_description";
  elementsById.get("save").attributes["data-i18n"] = "btn_save_config";
  elementsById.get("status").attributes["data-i18n"] = "status_saved";

  let domContentLoadedHandler = null;
  const document = {
    addEventListener(event, handler) {
      if (event === "DOMContentLoaded") {
        domContentLoadedHandler = handler;
      }
    },
    getElementById(id) {
      return elementsById.get(id) ?? null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") {
        return localized;
      }
      if (selector === "[data-i18n-title]") {
        return [];
      }
      return [];
    },
    title: ""
  };

  let storageData = {
    custom_adapters: [{ host: "example.com" }],
    voicemux_pair_url: "https://pair.knc.jp",
    voicemux_hub_url: "https://hub.knc.jp"
  };
  let lastSetPayload = null;
  let lastAlert = null;
  const timers = [];

  const chrome = {
    i18n: {
      getMessage(key, substitutions = []) {
        const messages = {
          options_operator_header: "Operator Configuration",
          options_pair_url_label: "Pairing Surface URL",
          options_hub_url_label: "VoiceMuxHub URL",
          btn_save_config: "Save Configuration",
          status_saved: "Settings saved successfully",
          invalid_json_format: `Invalid JSON format: ${substitutions[0] || ""}`,
          options_pair_url_invalid: "Invalid Pairing Surface URL",
          options_hub_url_invalid: "Invalid VoiceMuxHub URL"
        };
        return messages[key] || "";
      }
    },
    storage: {
      local: {
        async get(keys) {
          const result = {};
          keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(storageData, key)) {
              result[key] = storageData[key];
            }
          });
          return result;
        },
        async set(payload) {
          lastSetPayload = payload;
          storageData = { ...storageData, ...payload };
        }
      }
    }
  };

  return {
    context: {
      chrome,
      document,
      URL,
      alert(message) {
        lastAlert = message;
      },
      setTimeout(fn) {
        timers.push(fn);
        return timers.length;
      },
      clearTimeout() {}
    },
    elementsById,
    getDomContentLoadedHandler() {
      return domContentLoadedHandler;
    },
    getLastSetPayload() {
      return lastSetPayload;
    },
    getLastAlert() {
      return lastAlert;
    },
    async flushTimers() {
      while (timers.length > 0) {
        const fn = timers.shift();
        await fn();
      }
    }
  };
}

test("options page loads and saves pair and hub URLs alongside custom adapters", async () => {
  const env = createOptionsEnvironment();
  const source = fs.readFileSync(
    path.join(REPO_ROOT, "options.js"),
    "utf8"
  );

  vm.runInNewContext(source, env.context, { filename: "options.js" });

  const start = env.getDomContentLoadedHandler();
  assert.ok(start, "DOMContentLoaded handler should be registered");
  await start();

  assert.equal(env.elementsById.get("pair-url").value, "https://pair.knc.jp");
  assert.equal(env.elementsById.get("hub-url").value, "https://hub.knc.jp");
  assert.match(env.elementsById.get("custom-adapters").value, /example\.com/);

  env.elementsById.get("pair-url").value = "https://pair.example.com";
  env.elementsById.get("hub-url").value = "https://hub.example.com";
  env.elementsById.get("custom-adapters").value = JSON.stringify([{ host: "pair.example.com" }]);

  await env.elementsById.get("save").click();
  await env.flushTimers();

  assert.equal(
    JSON.stringify(env.getLastSetPayload()),
    JSON.stringify({
      custom_adapters: [{ host: "pair.example.com" }],
      voicemux_pair_url: "https://pair.example.com",
      voicemux_hub_url: "https://hub.example.com"
    })
  );
  assert.equal(env.elementsById.get("status").textContent, "Settings saved successfully");
  assert.equal(env.getLastAlert(), null);
});

test("options page rejects invalid pair URL", async () => {
  const env = createOptionsEnvironment();
  const source = fs.readFileSync(
    path.join(REPO_ROOT, "options.js"),
    "utf8"
  );

  vm.runInNewContext(source, env.context, { filename: "options.js" });

  const start = env.getDomContentLoadedHandler();
  await start();

  env.elementsById.get("pair-url").value = "not-a-url";
  await env.elementsById.get("save").click();

  assert.equal(env.getLastAlert(), "Invalid Pairing Surface URL");
  assert.equal(env.getLastSetPayload(), null);
});
