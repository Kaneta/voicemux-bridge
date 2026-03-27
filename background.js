/**
 * VoiceMux Bridge: Extension Service Worker (WebSocket Relay)
 * Version: 2.56.58.24
 *
 * DESIGN INTENT:
 * Acts as the authoritative decryption and relay hub.
 * Ensures all sensitive payloads (INTERIM, INSERT, etc.) are decrypted
 * using the E2EE key before being dispatched to content scripts.
 */

const BASE_WS_URL = "wss://v.knc.jp/socket/websocket";
const MAX_RETRY_DELAY = 30000;
const MAX_FAILED_CONNECTS_WITHOUT_JOIN = 2;
const DEBUG_LOG_KEY = "voicemux_debug_events";
const DEBUG_LOG_LIMIT = 50;

let socket = null;
let heartbeatInterval = null;
let retryTimer = null;
let retryDelay = 1000;
let currentRoomId = null;
let isJoined = false;
let failedConnectsWithoutJoin = 0;
let isPurgingAuth = false;
let preferredTabId = null;
const JOIN_REF = "1";
const remoteDevices = new Map();

function appendDebugEvent(event, detail = {}) {
	const entry = {
		ts: new Date().toISOString(),
		source: "background",
		event,
		detail
	};

	chrome.storage.local.get(DEBUG_LOG_KEY, (data) => {
		const existing = Array.isArray(data[DEBUG_LOG_KEY]) ? data[DEBUG_LOG_KEY] : [];
		const next = [...existing.slice(-(DEBUG_LOG_LIMIT - 1)), entry];
		chrome.storage.local.set({ [DEBUG_LOG_KEY]: next });
	});
}

function safeAtob(str) {
	if (!str) {
		return "";
	}
	try {
		return atob(str.replace(/-/g, "+").replace(/_/g, "/").replace(/ /g, "+"));
	} catch (e) {
		console.error("[Base64] Decoding failed:", e);
		return "";
	}
}

/**
 * [Intent: Safe Decryption]
 * Decrypts AES-GCM payloads received from the relay.
 */
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
			Uint8Array.from(rawKey, (c) => {
				return c.charCodeAt(0);
			}),
			{ name: "AES-GCM" },
			false,
			["decrypt"]
		);

		const iv = Uint8Array.from(safeAtob(payload.iv), (c) => {
			return c.charCodeAt(0);
		});
		const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), (c) => {
			return c.charCodeAt(0);
		});

		const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
		return new TextDecoder().decode(decrypted);
	} catch (e) {
		console.error("[Crypto] Decryption failed:", e);
		return "[Decryption Error]";
	}
}

function safeSend(message) {
	if (socket && socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify(message));
		return true;
	}
	return false;
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

function purgeStoredAuth(reason) {
	if (isPurgingAuth) {
		return;
	}
	isPurgingAuth = true;
	appendDebugEvent("purge_auth", { reason, roomId: currentRoomId });
	console.warn("VoiceMux: Purging stale auth from extension.", { reason, roomId: currentRoomId });

	if (retryTimer) {
		clearTimeout(retryTimer);
		retryTimer = null;
	}
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
	}

	const activeSocket = socket;
	socket = null;
	currentRoomId = null;
	isJoined = false;
	failedConnectsWithoutJoin = 0;
	remoteDevices.clear();
	syncDevicePresence();

	chrome.storage.local.remove(
		[
			"voicemux_token",
			"voicemux_room_id",
			"voicemux_key",
			"voicemux_paired",
			"voicemux_pairing_code",
			"voicemux_mobile_connected"
		],
		() => {
			isPurgingAuth = false;
		}
	);

	if (activeSocket) {
		try {
			activeSocket.close();
		} catch {
			// best-effort cleanup
		}
	}
}

/**
 * [Intent: Secure Tab Dispatcher]
 * Forwards messages to the active tab after ensuring data is in plaintext.
 */
function notifyActiveTab(payload, eventName) {
	const dispatchToTab = (activeTab) => {
		if (activeTab) {
			const isActionablePayload = !!(payload?.action || payload?.command);
			appendDebugEvent("notifyActiveTab", {
				eventName,
				action: payload?.action || null,
				hasPlaintext: !!payload?.plaintext,
				actionable: isActionablePayload,
				tabId: activeTab.id,
				url: activeTab.url || null
			});
			console.log("VoiceMux: notifyActiveTab", {
				eventName,
				action: payload?.action || null,
				hasPlaintext: !!payload?.plaintext,
				sender: payload?.sender_tab_id || "system",
				tabId: activeTab.id,
				url: activeTab.url
			});
			// 1. Always send a log for visibility
			chrome.tabs
				.sendMessage(activeTab.id, {
					action: "LOG",
					message: `📡 [${eventName}] | Sender: ${payload?.sender_tab_id || "system"}`
				})
				.catch(() => {
					/* silent */
				});

			// 2. Dispatch only actionable commands.
			// Presence/status events are useful for debugging but should not reach
			// content.js, which only understands command-style payloads.
			if (isActionablePayload && eventName !== "phx_reply" && eventName !== "phx_error") {
				chrome.tabs.sendMessage(activeTab.id, payload).catch(() => {
					/* silent */
				});
			}
		} else {
			appendDebugEvent("notifyActiveTab.missed", {
				eventName,
				action: payload?.action || null
			});
			console.warn("VoiceMux: notifyActiveTab skipped because no active tab was found.", {
				eventName,
				action: payload?.action || null
			});
		}
	};

	if (preferredTabId) {
		chrome.tabs.get(preferredTabId, (tab) => {
			if (chrome.runtime.lastError || !tab?.id) {
				preferredTabId = null;
				chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
					dispatchToTab(tabs[0]);
				});
				return;
			}

			dispatchToTab(tab);
		});
		return;
	}

	chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
		dispatchToTab(tabs[0]);
	});
}

/**
 * [Intent: Smart Tab Management]
 * Finds an existing Hub tab for the given roomId and focuses it.
 * If not found, creates a new one with the E2EE key attached.
 */
async function handleOpenEditor(roomId) {
	const data = await chrome.storage.local.get(["voicemux_key", "voicemux_hub_url"]);
	const key = data.voicemux_key || "";
	const hubOrigin = new URL(data.voicemux_hub_url || "https://hub.knc.jp").origin;
	const targetUrl = `${hubOrigin}/review/${roomId}${key ? "#key=" + key : ""}`;

	chrome.tabs.query({ url: `${hubOrigin}/*` }, (tabs) => {
		const existingTab = tabs.find((t) => {
			return t.url.includes(roomId);
		});

		if (existingTab) {
			// If key is missing in URL but we have it, we could update it,
			// but for now just focusing is standard.
			// Hub also tries to sync from extension DOM if missing.
			chrome.tabs.update(existingTab.id, { active: true });
			chrome.windows.update(existingTab.windowId, { focused: true });
			console.log("VoiceMux: Focused existing Hub tab.");
		} else {
			chrome.tabs.create({ url: targetUrl });
			console.log("VoiceMux: Created new Hub tab with E2EE key.");
		}
	});
}

async function connect() {
	if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
		return;
	}

	const data = await chrome.storage.local.get(["voicemux_token", "voicemux_room_id"]);
	if (!data.voicemux_token || !data.voicemux_room_id) {
		return;
	}

	currentRoomId = data.voicemux_room_id;
	remoteDevices.clear();
	syncDevicePresence();
	const topic = `room:${currentRoomId}`;
	socket = new WebSocket(`${BASE_WS_URL}?vsn=2.0.0&token=${data.voicemux_token}`);

	socket.onopen = () => {
		console.log("VoiceMux: Socket established. Joining room...");
		isJoined = false;
		safeSend([JOIN_REF, JOIN_REF, topic, "phx_join", {}]);
		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
		}
		heartbeatInterval = setInterval(() => {
			safeSend([null, "heartbeat", "phoenix", "heartbeat", {}]);
		}, 30000);
	};

	socket.onmessage = async (event) => {
		const [, , msgTopic, eventName, payload] = JSON.parse(event.data);
		if (msgTopic !== topic) {
			return;
		}

		// [Intent: Automatic Decryption for Remote Commands]
		// If the payload is encrypted, decrypt it BEFORE sending to the tab.
		if (payload && payload.ciphertext) {
			const plaintext = await decrypt(payload);
			if (plaintext) {
				if (plaintext === "[Key Mismatch]" || plaintext === "[Decryption Error]") {
					purgeStoredAuth("decrypt_failure");
					return;
				}
				payload.plaintext = plaintext; // Add decrypted text to payload
			}
		}

		notifyActiveTab(payload, eventName);

		// [Intent: Remote-to-Local OS Interaction]
		if (eventName === "remote_command" && payload.action === "OPEN_EDITOR") {
			handleOpenEditor(currentRoomId);
		}

		if (eventName === "phx_reply" && payload?.status === "ok") {
			console.log("VoiceMux: Channel Joined Successfully.");
			isJoined = true;
			failedConnectsWithoutJoin = 0;
			retryDelay = 1000;
			syncDevicePresence();
			safeSend([JOIN_REF, "2", topic, "device_online", { sender_tab_id: "extension" }]);
		} else if (eventName === "device_online" && payload.sender_tab_id !== "extension") {
			if (isJoined) {
				remoteDevices.set(payload.sender_tab_id, payload.device_type || "unknown");
				syncDevicePresence();
				chrome.storage.local.set({ voicemux_paired: true });
				safeSend([JOIN_REF, "3", topic, "device_online", { sender_tab_id: "extension" }]);
			}
		} else if (eventName === "device_offline" && payload.sender_tab_id !== "extension") {
			remoteDevices.delete(payload.sender_tab_id);
			syncDevicePresence();
		}
	};

	socket.onclose = () => {
		if (isPurgingAuth) {
			return;
		}
		isJoined = false;
		remoteDevices.clear();
		syncDevicePresence();
		failedConnectsWithoutJoin += 1;
		if (failedConnectsWithoutJoin >= MAX_FAILED_CONNECTS_WITHOUT_JOIN) {
			purgeStoredAuth("socket_failed_before_join");
			return;
		}
		scheduleReconnect();
	};
	socket.onerror = () => {
		appendDebugEvent("socket_error", {
			roomId: currentRoomId,
			failedConnectsWithoutJoin
		});
		socket.close();
	};
}

function scheduleReconnect() {
	if (retryTimer) {
		clearTimeout(retryTimer);
	}
	retryTimer = setTimeout(() => {
		connect();
	}, retryDelay);
	retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
}

function handleSyncAuth(request, sender, sendResponse) {
	if (request.action === "TARGET_FOCUS") {
		preferredTabId = sender?.tab?.id || null;
		appendDebugEvent("target_focus", {
			tabId: preferredTabId,
			url: sender?.tab?.url || null,
			tag: request.tag || null,
			role: request.role || null
		});
		if (typeof sendResponse === "function") {
			sendResponse({ success: true });
		}
		return false;
	}

	if (request.action === "SYNC_AUTH") {
		const data = request.payload || request;
		const cleanKey = (data.key || "").replace(/ /g, "+");
		remoteDevices.clear();
		appendDebugEvent("sync_auth", {
			uuid: data.uuid || null,
			hasToken: !!data.token,
			hasKey: !!cleanKey,
			hubUrl: data.hub_url || sender.url || null
		});
		chrome.storage.local.set(
			{
				voicemux_token: data.token,
				voicemux_room_id: data.uuid,
				voicemux_key: cleanKey,
				voicemux_mobile_connected: false,
				voicemux_hub_url: data.hub_url || sender.url // Prefer explicit target surface over sender origin
			},
			() => {
				failedConnectsWithoutJoin = 0;
				if (socket) {
					socket.close();
				}
				connect();
				if (typeof sendResponse === "function") {
					sendResponse({ success: true });
				}
			}
		);
		return true;
	}

	if (request.action === "GET_AUTH") {
		appendDebugEvent("get_auth");
		// [Intent: Vault Access] Retrieve credentials from extension storage
		chrome.storage.local.get(["voicemux_token", "voicemux_room_id", "voicemux_key"], (data) => {
			if (typeof sendResponse === "function") {
				sendResponse({
					token: data.voicemux_token,
					uuid: data.voicemux_room_id,
					key: data.voicemux_key
				});
			}
		});
		return true;
	}

	if (request.action === "CLEAR_AUTH") {
		appendDebugEvent("clear_auth");
		remoteDevices.clear();
		// [Intent: Vault Purge] Explicitly remove all credentials on session reset
		chrome.storage.local.remove(
			[
				"voicemux_token",
				"voicemux_room_id",
				"voicemux_key",
				"voicemux_paired",
				"voicemux_pairing_code",
				"voicemux_mobile_connected"
			],
			() => {
				console.log("VoiceMux: Auth cleared from extension.");
				if (socket) {
					socket.close();
				}
				if (typeof sendResponse === "function") {
					sendResponse({ success: true });
				}
			}
		);
		return true;
	}

	if (request.action === "RESET_ROOM") {
		appendDebugEvent("reset_room");

		const topic = currentRoomId ? `room:${currentRoomId}` : null;
		if (topic && isJoined) {
			safeSend([
				JOIN_REF,
				"9",
				topic,
				"remote_command",
				{
					action: "RESET_ROOM",
					sender_tab_id: "extension",
					device_type: "extension"
				}
			]);
		}

		purgeStoredAuth("manual_reset");

		if (typeof sendResponse === "function") {
			sendResponse({ success: true });
		}
		return true;
	}
	return false;
}

chrome.runtime.onMessage.addListener(handleSyncAuth);
chrome.runtime.onMessageExternal.addListener(handleSyncAuth);
chrome.tabs.onRemoved.addListener((tabId) => {
	if (preferredTabId === tabId) {
		preferredTabId = null;
	}
});

connect();
