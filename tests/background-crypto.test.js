const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

const { createBackgroundCrypto } = require("../background-crypto.js");

function installCryptoGlobals(options = {}) {
  const originalChrome = global.chrome;
  const originalAtob = global.atob;

  global.chrome = {
    storage: {
      local: {
        async get() {
          return {
            voicemux_key: options.keyBase64 ?? Buffer.alloc(32, 1).toString("base64")
          };
        }
      }
    }
  };

  global.atob = options.atob || ((input) => {
    return Buffer.from(input, "base64").toString("binary");
  });

  return () => {
    global.chrome = originalChrome;
    global.atob = originalAtob;
  };
}

test("decrypt returns plaintext when payload and key are valid", async () => {
  const rawKey = Uint8Array.from({ length: 32 }, (_value, index) => {
    return index + 1;
  });
  const keyBase64 = Buffer.from(rawKey).toString("base64");
  const restore = installCryptoGlobals({ keyBase64 });

  try {
    const cryptoKey = await webcrypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    const iv = Uint8Array.from({ length: 12 }, (_value, index) => {
      return index + 1;
    });
    const ciphertext = await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode("hello")
    );

    const cryptoState = createBackgroundCrypto();
    const plaintext = await cryptoState.decrypt({
      iv: Buffer.from(iv).toString("base64"),
      ciphertext: Buffer.from(ciphertext).toString("base64"),
      key_hint: keyBase64.substring(0, 4)
    });

    assert.equal(plaintext, "hello");
  } finally {
    restore();
  }
});

test("decrypt returns key mismatch when payload hint does not match local key", async () => {
  const restore = installCryptoGlobals();

  try {
    const cryptoState = createBackgroundCrypto();
    const plaintext = await cryptoState.decrypt({
      iv: Buffer.from("iv").toString("base64"),
      ciphertext: Buffer.from("ciphertext").toString("base64"),
      key_hint: "mismatch"
    });

    assert.equal(plaintext, "[Key Mismatch]");
  } finally {
    restore();
  }
});
