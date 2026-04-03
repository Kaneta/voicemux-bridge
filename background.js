/**
 * VoiceMux Bridge: Extension Service Worker (WebSocket Relay)
 * Version: 2.56.58.24
 *
 * DESIGN INTENT:
 * Acts as the authoritative decryption and relay hub.
 * Ensures all sensitive payloads (INTERIM, INSERT, etc.) are decrypted
 * using the E2EE key before being dispatched to content scripts.
 */

if (typeof importScripts === "function") {
	importScripts("./background-connection-logic.js");
}

const { computeReconnectSchedule, decideSocketCloseRecovery } =
	globalThis.VoiceMuxBackgroundConnectionLogic;
const { reduceJoinSuccess, reduceRuntimeWake } =
	globalThis.VoiceMuxBackgroundConnectionLogic;

const BASE_WS_URL = "wss://v.knc.jp/socket/websocket";
const MAX_RETRY_DELAY = 30000;
const MAX_FAILED_CONNECTS_WITHOUT_JOIN = 2;
const DEBUG_LOG_KEY = "voicemux_debug_events";
const DEBUG_LOG_LIMIT = 50;
const PREWARM_TTL_MS = 2 * 60 * 1000;
const ACTIVE_AUTH_STORAGE_KEYS = ["voicemux_token", "voicemux_room_id", "voicemux_key"];
const PREWARM_STORAGE_KEYS = [
	"voicemux_prewarm_uuid",
	"voicemux_prewarm_token",
	"voicemux_prewarm_key",
	"voicemux_prewarm_created_at"
];
const AUTH_RESET_STORAGE_KEYS = [
	"voicemux_token",
	"voicemux_room_id",
	"voicemux_key",
	"voicemux_pair_origin",
	"voicemux_prewarm_uuid",
	"voicemux_prewarm_token",
	"voicemux_prewarm_key",
	"voicemux_prewarm_created_at",
	"voicemux_paired",
	"voicemux_pairing_code",
	"voicemux_mobile_connected"
];
const ACTIVE_AUTH_WITH_ORIGIN_KEYS = [
	"voicemux_token",
	"voicemux_room_id",
	"voicemux_key",
	"voicemux_pair_origin"
];

let socket = null;
let heartbeatInterval = null;
let retryTimer = null;
let retryDelay = 1000;
let currentRoomId = null;
let isJoined = false;
let failedConnectsWithoutJoin = 0;
let isPurgingAuth = false;
let preferredTabId = null;
let prewarmPromise = null;
const JOIN_REF = "1";
const remoteDevices = new Map();

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

function queryTabs(queryInfo) {
	return new Promise((resolve) => {
		chrome.tabs.query(queryInfo, (tabs) => {
			resolve(tabs || []);
		});
	});
}

function createTab(createProperties) {
	return new Promise((resolve) => {
		chrome.tabs.create(createProperties, (tab) => {
			resolve(tab || null);
		});
	});
}

function updateTab(tabId, updateProperties) {
	return new Promise((resolve) => {
		chrome.tabs.update(tabId, updateProperties, (tab) => {
			resolve(tab || null);
		});
	});
}

function focusWindow(windowId) {
	return new Promise((resolve) => {
		if (!Number.isInteger(windowId)) {
			resolve(null);
			return;
		}
		chrome.windows.update(windowId, { focused: true }, (windowRef) => {
			resolve(windowRef || null);
		});
	});
}

async function openOrFocusPairSurface() {
	const pairOrigin = await getPairOrigin();
	const targetUrl = `${pairOrigin}/chrome`;
	const tabs = await queryTabs({ url: `${pairOrigin}/chrome*` });
	const existingTab = tabs.find((tab) => {
		return typeof tab.url === "string" && tab.url.startsWith(targetUrl);
	});

	if (existingTab?.id) {
		await updateTab(existingTab.id, { active: true });
		await focusWindow(existingTab.windowId);
		appendDebugEvent("open_pair_surface.focus_existing", {
			tabId: existingTab.id,
			url: existingTab.url || targetUrl
		});
		return { action: "focused_existing", tabId: existingTab.id, url: existingTab.url || targetUrl };
	}

	const createdTab = await createTab({ url: targetUrl });
	appendDebugEvent("open_pair_surface.create_new", {
		tabId: createdTab?.id || null,
		url: targetUrl
	});
	return { action: "created_new", tabId: createdTab?.id || null, url: targetUrl };
}

function generateEncryptionKey() {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode(...array))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

async function issueFreshSession() {
	const res = await fetch("https://v.knc.jp/api/auth/issue", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({})
	});

	if (!res.ok) {
		throw new Error(`issue_failed_${res.status}`);
	}

	const data = await res.json();
	return {
		uuid: data.room || data.uuid || null,
		token: data.token || null
	};
}

function getPrewarmStorage() {
	return chrome.storage.local.get(PREWARM_STORAGE_KEYS);
}

function clearPrewarmStorage() {
	return chrome.storage.local.remove(PREWARM_STORAGE_KEYS);
}

async function readFreshPrewarm() {
	const data = await getPrewarmStorage();
	const createdAt = Number(data.voicemux_prewarm_created_at || 0);
	const isFresh = createdAt > 0 && Date.now() - createdAt < PREWARM_TTL_MS;
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
		const active = await chrome.storage.local.get(["voicemux_room_id", "voicemux_token", "voicemux_key"]);
		if (active.voicemux_room_id && active.voicemux_token && active.voicemux_key) {
			return null;
		}

		const existing = await readFreshPrewarm();
		if (existing) {
			appendDebugEvent("prewarm_reuse", { uuid: existing.uuid });
			return existing;
		}

		const room = await issueFreshSession();
		if (!room.uuid || !room.token) {
			throw new Error("invalid_prewarm_issue_response");
		}

		const key = generateEncryptionKey();
		const payload = {
			voicemux_prewarm_uuid: room.uuid,
			voicemux_prewarm_token: room.token,
			voicemux_prewarm_key: key,
			voicemux_prewarm_created_at: Date.now()
		};
		await chrome.storage.local.set(payload);
		appendDebugEvent("prewarm_created", { uuid: room.uuid });
		return { uuid: room.uuid, token: room.token, key };
	})()
		.catch((error) => {
			appendDebugEvent("prewarm_failed", {
				message: error instanceof Error ? error.message : String(error)
			});
			return null;
		})
		.finally(() => {
			prewarmPromise = null;
		});

	return prewarmPromise;
}

function getPresenceRole(payload) {
	if (!payload || typeof payload !== "object") {
		return null;
	}
	if (typeof payload.role === "string" && payload.role.length > 0) {
		return payload.role;
	}
	if (payload.sender_tab_id === "extension") {
		return "extension";
	}
	return null;
}

function isMobilePresence(payload) {
	return getPresenceRole(payload) === "mobile";
}

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

function resetRelayConnectionState() {
	socket = null;
	currentRoomId = null;
	isJoined = false;
	failedConnectsWithoutJoin = 0;
	remoteDevices.clear();
	syncDevicePresence();
}

async function readActiveAuthSnapshot() {
	return chrome.storage.local.get(ACTIVE_AUTH_STORAGE_KEYS);
}

function removeAuthStorage(callback) {
	chrome.storage.local.remove(AUTH_RESET_STORAGE_KEYS, callback);
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
	appendDebugEvent("get_auth");
	chrome.storage.local.get(ACTIVE_AUTH_WITH_ORIGIN_KEYS, (data) => {
		const senderOrigin = getOriginFromUrl(senderUrl);
		const storedPairOrigin = getOriginFromUrl(data.voicemux_pair_origin);
		const hasOriginMismatch =
			!!senderOrigin && !!storedPairOrigin && senderOrigin !== storedPairOrigin;

		if (typeof sendResponse !== "function") {
			return;
		}

		if (hasOriginMismatch) {
			appendDebugEvent("get_auth_origin_mismatch", {
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

	stopRelayTimers();

	const activeSocket = socket;
	resetRelayConnectionState();

	removeAuthStorage(() => {
		isPurgingAuth = false;
	});

	closeSocketQuietly(activeSocket);
}

/**
 * [Intent: Secure Tab Dispatcher]
 * Forwards messages to the active tab after ensuring data is in plaintext.
 */
function notifyActiveTab(payload, eventName) {
	const dispatchToTab = (activeTab) => {
		if (activeTab) {
			const isActionablePayload = !!(payload?.action || payload?.command);
			const shouldMirrorToContentLog = isActionablePayload || eventName === "phx_error";
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
			// 1. Mirror only actionable/error events into content logs.
			// Presence chatter like device_online should stay in background debug logs.
			if (shouldMirrorToContentLog) {
				chrome.tabs
					.sendMessage(activeTab.id, {
						action: "LOG",
						message: `📡 [${eventName}] | Sender: ${payload?.sender_tab_id || "system"}`
					})
					.catch(() => {
						/* silent */
					});
			}

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
		appendDebugEvent("connect_skip_existing_socket", {
			readyState: socket.readyState,
			roomId: currentRoomId
		});
		return;
	}

	const data = await readActiveAuthSnapshot();
	if (!data.voicemux_token || !data.voicemux_room_id) {
		appendDebugEvent("connect_skip_missing_auth", {
			hasToken: !!data.voicemux_token,
			hasRoomId: !!data.voicemux_room_id
		});
		return;
	}

	currentRoomId = data.voicemux_room_id;
	remoteDevices.clear();
	syncDevicePresence();
	const topic = `room:${currentRoomId}`;
	appendDebugEvent("connect_start", {
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
		`${BASE_WS_URL}?vsn=2.0.0&token=${encodeURIComponent(data.voicemux_token)}&room=${encodeURIComponent(currentRoomId)}`
	);

	socket.onopen = () => {
		appendDebugEvent("socket_open", { roomId: currentRoomId });
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
			const joinSuccess = reduceJoinSuccess({
				baseRetryDelay: 1000
			});
			appendDebugEvent("join_ok", {
				roomId: currentRoomId,
				ref: payload?.response?.ref || null
			});
			console.log("VoiceMux: Channel Joined Successfully.");
			isJoined = joinSuccess.isJoined;
			failedConnectsWithoutJoin = joinSuccess.failedConnectsWithoutJoin;
			retryDelay = joinSuccess.retryDelay;
			syncDevicePresence();
			safeSend([JOIN_REF, "2", topic, "device_online", { sender_tab_id: "extension", role: "extension" }]);
		} else if (eventName === "device_online" && payload.sender_tab_id !== "extension") {
			if (isJoined) {
				remoteDevices.set(payload.sender_tab_id, getPresenceRole(payload) || "unknown");
				syncDevicePresence();
				chrome.storage.local.set({ voicemux_paired: true });
			}
		} else if (eventName === "device_offline" && payload.sender_tab_id !== "extension") {
			remoteDevices.delete(payload.sender_tab_id);
			syncDevicePresence();
		}
	};

socket.onclose = async (event) => {
		appendDebugEvent("socket_close", {
			roomId: currentRoomId,
			code: event.code,
			wasClean: event.wasClean,
			reason: event.reason || null,
			isPurgingAuth,
			isJoined,
			failedConnectsWithoutJoin
		});
		console.log("VoiceMux: socket_close", {
			roomId: currentRoomId,
			code: event.code,
			wasClean: event.wasClean,
			reason: event.reason || null,
			isPurgingAuth,
			isJoined,
			failedConnectsWithoutJoin
		});
		if (isPurgingAuth) {
			return;
		}
		isJoined = false;
		remoteDevices.clear();
		syncDevicePresence();
		const closeRecovery = decideSocketCloseRecovery({
			isPurgingAuth,
			hasActiveAuth: await hasActiveAuth(),
			failedConnectsWithoutJoin,
			maxFailedConnectsWithoutJoin: MAX_FAILED_CONNECTS_WITHOUT_JOIN
		});
		failedConnectsWithoutJoin = closeRecovery.nextFailedConnectsWithoutJoin;
		if (closeRecovery.action === "skip_no_auth") {
			appendDebugEvent("socket_close_skip_reconnect_no_auth", {
				roomId: currentRoomId
			});
			console.log("VoiceMux: socket_close_skip_reconnect_no_auth", {
				roomId: currentRoomId
			});
			return;
		}
		if (closeRecovery.action === "purge_auth") {
			purgeStoredAuth("socket_failed_before_join");
			return;
		}
		if (closeRecovery.action === "schedule_reconnect") {
			scheduleReconnect();
		}
	};
	socket.onerror = (event) => {
		appendDebugEvent("socket_error", {
			roomId: currentRoomId,
			failedConnectsWithoutJoin
		});
		console.warn("VoiceMux: socket_error", {
			roomId: currentRoomId,
			failedConnectsWithoutJoin,
			type: event?.type || null
		});
		socket.close();
	};
}

function scheduleReconnect() {
	if (retryTimer) {
		clearTimeout(retryTimer);
	}
	const reconnectSchedule = computeReconnectSchedule({
		retryDelay,
		maxRetryDelay: MAX_RETRY_DELAY
	});
	appendDebugEvent("schedule_reconnect", {
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

async function hasActiveAuth() {
	const data = await readActiveAuthSnapshot();
	return !!(data.voicemux_token && data.voicemux_room_id);
}

async function handleRuntimeWake(reason) {
	const wake = reduceRuntimeWake({
		hasActiveAuth: await hasActiveAuth()
	});
	appendDebugEvent("runtime_wake", { reason });
	if (wake.clearRemotePresence) {
		remoteDevices.clear();
		syncDevicePresence();
	}
	await connect();
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
		const pairOrigin = getOriginFromUrl(sender?.url);
		remoteDevices.clear();
		appendDebugEvent("sync_auth", {
			uuid: data.uuid || null,
			hasToken: !!data.token,
			hasKey: !!cleanKey,
			hubUrl: data.hub_url || sender.url || null,
			pairOrigin
		});
		setStoredAuthSnapshot(
			{
				uuid: data.uuid,
				token: data.token,
				key: cleanKey,
				hubUrl: data.hub_url || sender.url,
				pairOrigin
			},
			() => {
				void clearPrewarmStorage();
				failedConnectsWithoutJoin = 0;
				closeSocketQuietly(socket);
				connect();
				if (typeof sendResponse === "function") {
					sendResponse({ success: true });
				}
			}
		);
		return true;
	}

	if (request.action === "GET_AUTH") {
		// [Intent: Vault Access] Retrieve credentials from extension storage
		readScopedAuthForSender(sender?.url, sendResponse);
		return true;
	}

	if (request.action === "CLEAR_AUTH") {
		appendDebugEvent("clear_auth");
		remoteDevices.clear();
		// [Intent: Vault Purge] Explicitly remove all credentials on session reset
		removeAuthStorage(() => {
			console.log("VoiceMux: Auth cleared from extension.");
			closeSocketQuietly(socket);
			if (typeof sendResponse === "function") {
				sendResponse({ success: true });
			}
		});
		return true;
	}

	if (request.action === "RESET_ROOM") {
		appendDebugEvent("reset_room");
		console.log("VoiceMux: reset_room", {
			roomId: currentRoomId,
			isJoined
		});

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
					role: "extension"
				}
			]);
		}

		purgeStoredAuth("manual_reset");

		if (typeof sendResponse === "function") {
			sendResponse({ success: true });
		}
		return true;
	}

	if (request.action === "PREWARM_PAIR_AUTH") {
		ensurePrewarmedPairAuth().then((payload) => {
			if (typeof sendResponse === "function") {
				sendResponse(payload || { success: false });
			}
		});
		return true;
	}

	if (request.action === "GET_PREWARM_PAIR_AUTH") {
		readFreshPrewarm().then((payload) => {
			if (typeof sendResponse === "function") {
				sendResponse(payload || { success: false });
			}
		});
		return true;
	}

	if (request.action === "OPEN_PAIR_SURFACE") {
		openOrFocusPairSurface()
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
	return false;
}

chrome.runtime.onMessage.addListener(handleSyncAuth);
chrome.runtime.onMessageExternal.addListener(handleSyncAuth);
if (chrome.runtime?.onInstalled?.addListener) {
	chrome.runtime.onInstalled.addListener((details) => {
		return handleRuntimeWake(`onInstalled:${details?.reason || "unknown"}`);
	});
}
if (chrome.runtime?.onStartup?.addListener) {
	chrome.runtime.onStartup.addListener(() => {
		return handleRuntimeWake("onStartup");
	});
}
chrome.tabs.onRemoved.addListener((tabId) => {
	if (preferredTabId === tabId) {
		preferredTabId = null;
	}
});

void handleRuntimeWake("worker_load");
