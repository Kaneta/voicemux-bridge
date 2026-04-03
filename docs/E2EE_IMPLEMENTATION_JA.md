# VoiceMux Bridge: E2EE実装技術レポート

この文書では、現在の E2EE の流れを、実際のコード断片を使って説明します。

## 1. trusted なファーストパーティ surface が room snapshot を同期する

trusted な VoiceMux のファーストパーティ Web surface は、Chrome の内部メッセージ API を使って、現在の room snapshot を拡張機能へ渡せます。

この公開リポジトリで監査できる範囲として重要なのは、[`manifest.json`](../manifest.json) の allowlist です。

```json
"externally_connectable": {
  "matches": [
    "https://hub.knc.jp/*",
    "https://pair.knc.jp/*",
    "https://staging-pair.knc.jp/*",
    "http://localhost/*"
  ]
}
```

透明性の観点で重要なのは次の点です。

- 拡張機能自身は room を発行しない
- 拡張機能は明示的な room snapshot を受け取る
- 遷移先の Hub origin もその snapshot に含まれる

## 2. 拡張機能は room snapshot をローカル保存する

拡張機能が `SYNC_AUTH` を受けると、room token、room id、鍵、trusted な Hub origin、trusted な pairing origin を `chrome.storage.local` に保存します。

出典: [`voicemux-bridge/background-runtime-messages.js`](../background-runtime-messages.js), [`voicemux-bridge/background-auth-state.js`](../background-auth-state.js)

```javascript
deps.setStoredAuthSnapshot(
	{
		uuid: data.uuid,
		token: data.token,
		key: cleanKey,
		hubUrl: data.hub_url || sender?.url,
		pairOrigin
	},
	() => {
		deps.connect();
	}
);
```

つまり拡張機能が保持するのは、次に必要な最小限のローカル状態です。

- relay room へ再接続するための資格情報
- 受信 payload を復号するための鍵
- 正しいファーストパーティ Hub surface を開くための origin
- production / staging など異なる pairing origin 間で auth を誤再利用しないための origin 情報

最近の recovery 更新では、通常 UX は変えずに background worker の挙動を安定化しています。

- worker load, `onStartup`, `onInstalled` 時に stale な mobile presence を正規化してから reconnect
- reconnect / purge / join success の判定は `background-connection-logic.js` に分離
- これらの経路は repo 内の regression test で固定

## 3. 復号は background worker の中で行われる

relay が送るのは暗号化済み blob です。拡張機能はローカル鍵を読み込み、Web Crypto で復号します。

出典: [`voicemux-bridge/background-crypto.js`](../background-crypto.js)

```javascript
const data = await chrome.storage.local.get("voicemux_key");
const keyBase64 = data.voicemux_key;
…
const key = await crypto.subtle.importKey(
	"raw",
	Uint8Array.from(rawKey, (c) => {
		return c.charCodeAt(0);
	}),
	{ name: "AES-GCM" },
	false,
	["decrypt"]
);
…
const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
return new TextDecoder().decode(decrypted);
```

この時点で relay は平文を見ません。鍵は client のローカルに残ります。

この recovery 動作のために `alarms` permission を追加してはいません。

## 4. content script はローカル復号後の平文だけを受け取る

復号後、拡張機能は平文 command をアクティブタブへ渡します。

出典: [`voicemux-bridge/content.js`](../content.js)

```javascript
const action = request.action || request.command;
let data = "";
if (request.plaintext) { data = request.plaintext; }
…
if (action === "INTERIM") {
	document.execCommand("insertText", false, data);
} else if (action === "INSERT") {
	document.execCommand("insertText", false, data);
}
```

content script が注入するのは、すでにローカルで復号されたテキストです。relay から鍵を受け取ることはありません。

## 5. サーバーが見えるもの / 見えないもの

`v.knc.jp` の relay が見えるもの:

- room join の試行
- 暗号化済み transport payload
- reset などの room lifecycle event

`v.knc.jp` の relay が見えないもの:

- E2EE 鍵
- 音声入力された平文テキスト
- PC の Web サイトへ注入された平文

## 6. なぜ監査可能なのか

VoiceMux Bridge はオープンソースで、難読化していません。誰でも次を確認できます。

- どの Web origin が拡張機能へ状態同期できるか
- ローカル鍵保存がどう動くか
- 復号がどこで行われるか
- 平文がどこで最終的に注入されるか

この透明性自体が、セキュリティモデルの中心です。

---
`2.2.x` 系の公開実装に合わせて更新。
