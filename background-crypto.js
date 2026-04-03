(function attachBackgroundCrypto(globalScope) {
  function createBackgroundCrypto() {
    function safeAtob(str) {
      if (!str) {
        return "";
      }
      try {
        return atob(str.replace(/-/g, "+").replace(/_/g, "/").replace(/ /g, "+"));
      } catch (error) {
        console.error("[Base64] Decoding failed:", error);
        return "";
      }
    }

    async function decrypt(payload) {
      try {
        const data = await chrome.storage.local.get("voicemux_key");
        const keyBase64 = data.voicemux_key;
        if (!keyBase64 || !payload.ciphertext) {
          return null;
        }

        const cleanKey = keyBase64.replace(/ /g, "+");
        const localHint = cleanKey.substring(0, 4);
        if (payload.key_hint && payload.key_hint !== localHint) {
          console.warn(`VoiceMux: Key Mismatch! Received: ${payload.key_hint} | Local: ${localHint}`);
          return "[Key Mismatch]";
        }

        const rawKey = safeAtob(cleanKey);
        const key = await crypto.subtle.importKey(
          "raw",
          Uint8Array.from(rawKey, (char) => {
            return char.charCodeAt(0);
          }),
          { name: "AES-GCM" },
          false,
          ["decrypt"]
        );

        const iv = Uint8Array.from(safeAtob(payload.iv), (char) => {
          return char.charCodeAt(0);
        });
        const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), (char) => {
          return char.charCodeAt(0);
        });

        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
      } catch (error) {
        console.error("[Crypto] Decryption failed:", error);
        return "[Decryption Error]";
      }
    }

    return {
      decrypt
    };
  }

  const api = {
    createBackgroundCrypto
  };

  globalScope.VoiceMuxBackgroundCrypto = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
