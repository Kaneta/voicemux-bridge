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
	importScripts("./background-auth-state.js");
	importScripts("./background-crypto.js");
	importScripts("./background-telemetry.js");
	importScripts("./background-tabs.js");
	importScripts("./background-runtime-messages.js");
	importScripts("./background-relay-coordinator.js");
	importScripts("./background-relay-session.js");
	importScripts("./background-relay-runtime.js");
}

const { computeReconnectSchedule, decideSocketCloseRecovery } =
	globalThis.VoiceMuxBackgroundConnectionLogic;
const { reduceJoinSuccess, reduceRuntimeWake } =
	globalThis.VoiceMuxBackgroundConnectionLogic;
const { createBackgroundAuthState } =
	globalThis.VoiceMuxBackgroundAuthState;
const { createBackgroundCrypto } =
	globalThis.VoiceMuxBackgroundCrypto;
const { createBackgroundTelemetry } =
	globalThis.VoiceMuxBackgroundTelemetry;
const { createBackgroundTabs } =
	globalThis.VoiceMuxBackgroundTabs;
const { createRuntimeMessageHandler } =
	globalThis.VoiceMuxBackgroundRuntimeMessages;
const { createRelayCoordinator } =
	globalThis.VoiceMuxBackgroundRelayCoordinator;
const { createBackgroundRelaySession } =
	globalThis.VoiceMuxBackgroundRelaySession;
const { createRelayRuntimeHandlers } =
	globalThis.VoiceMuxBackgroundRelayRuntime;

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

let preferredTabId = null;
const JOIN_REF = "1";

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

const telemetry = createBackgroundTelemetry({
	debugLogKey: DEBUG_LOG_KEY,
	debugLogLimit: DEBUG_LOG_LIMIT
});
const cryptoState = createBackgroundCrypto();
const { appendDebugEvent } = telemetry;
const { decrypt } = cryptoState;
const authState = createBackgroundAuthState({
	activeAuthStorageKeys: ACTIVE_AUTH_STORAGE_KEYS,
	activeAuthWithOriginKeys: ACTIVE_AUTH_WITH_ORIGIN_KEYS,
	appendDebugEvent,
	authResetStorageKeys: AUTH_RESET_STORAGE_KEYS,
	generateEncryptionKey,
	issueFreshSession,
	prewarmStorageKeys: PREWARM_STORAGE_KEYS,
	prewarmTtlMs: PREWARM_TTL_MS
});

const {
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
} = authState;
const tabsState = createBackgroundTabs({
	appendDebugEvent,
	getPairOrigin,
	getPreferredTabId() {
		return preferredTabId;
	},
	setPreferredTabId(value) {
		preferredTabId = value;
	}
});
const { handleOpenEditor, notifyActiveTab, openOrFocusPairSurface } = tabsState;
let relayCoordinatorRef = null;
const relaySession = createBackgroundRelaySession({
	appendDebugEvent,
	baseRetryDelay: 1000,
	baseWsUrl: BASE_WS_URL,
	computeReconnectSchedule,
	createRelayRuntimeHandlers,
	getRelayCoordinator() {
		return relayCoordinatorRef;
	},
	heartbeatIntervalMs: 30000,
	joinRef: JOIN_REF,
	maxRetryDelay: MAX_RETRY_DELAY,
	readActiveAuthSnapshot,
	removeAuthStorage
});
const relayCoordinator = createRelayCoordinator({
	appendDebugEvent,
	baseRetryDelay: 1000,
	decideSocketCloseRecovery,
	decrypt,
	getPresenceRole,
	handleOpenEditor,
	hasActiveAuth,
	joinRef: JOIN_REF,
	maxFailedConnectsWithoutJoin: MAX_FAILED_CONNECTS_WITHOUT_JOIN,
	notifyActiveTab,
	reduceJoinSuccess,
	...relaySession
});
relayCoordinatorRef = relayCoordinator;
const {
	clearRemoteDevices,
	closeSocketQuietly,
	connect,
	getCurrentRoomId,
	getIsJoined,
	getSocket,
	purgeStoredAuth,
	safeSend,
	setFailedConnectsWithoutJoin,
	syncDevicePresence
} = relaySession;

async function handleRuntimeWake(reason) {
	const wake = reduceRuntimeWake({
		hasActiveAuth: await hasActiveAuth()
	});
	appendDebugEvent("runtime_wake", { reason });
	if (wake.clearRemotePresence) {
		clearRemoteDevices();
		syncDevicePresence();
	}
	await connect();
}

const handleSyncAuth = createRuntimeMessageHandler({
	appendDebugEvent,
	clearPrewarmStorage,
	clearRemoteDevices,
	closeSocketQuietly,
	connect,
	ensurePrewarmedPairAuth,
	getCurrentRoomId,
	getIsJoined,
	getOriginFromUrl,
	getSocket,
	joinRef: JOIN_REF,
	openOrFocusPairSurface,
	purgeStoredAuth,
	readFreshPrewarm,
	readScopedAuthForSender,
	removeAuthStorage,
	safeSend,
	setFailedConnectsWithoutJoin,
	setPreferredTabId(value) {
		preferredTabId = value;
	},
	setStoredAuthSnapshot
});

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
