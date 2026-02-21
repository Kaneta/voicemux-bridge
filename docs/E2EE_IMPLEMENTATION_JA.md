# VoiceMux Bridge: E2EE実装技術レポート

VoiceMux Bridge がどのようにしてデータの秘密を保持し、サーバーに内容を見せない仕組みになっているかを、実際のソースコードを抜粋して解説します。

---

## 1. ローカルでの暗号鍵生成とセキュアな転送
暗号鍵（AES-GCM 128bit）は [VoiceMux Hub](https://hub.knc.jp) で生成され、ブラウザの正規メッセージング API を通じて拡張機能へ安全にプッシュされます。サーバーへ送信されることは決してありません。

**証拠コード: `background.js` (受信側)**
```javascript
// 155行目付近: Hub からの資格情報プッシュを待機
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_AUTH") {
    const { uuid, token, key } = request.payload;
    
    // 拡張機能専用の安全な領域に保存
    chrome.storage.local.set({
      'voicemux_room_id': uuid,
      'voicemux_token': token,
      'voicemux_key': key
    }, () => { ... });
  }
});
```
この鍵は `chrome.storage.local` という、ブラウザが提供する「拡張機能専用の隔離された安全な領域」に保存されます。

---

## 2. サーバーを経由しない鍵共有（Zero-Knowledge）
スマホとのペアリング時、URLのハッシュフラグメント（`#`）を使用して、サーバーに鍵を知らせずにデバイス間で共有します。

**証拠コード: `popup.js`**
```javascript
// 45行目付近: ペアリング用URLの構築
let pairingUrl = `${hubOrigin}/${roomId}/zen`;
pairingUrl += `?token=${token}&uuid=${roomId}`;
pairingUrl += `#key=${keyBase64}`; // 鍵をハッシュに含める
```
URLの `#` 以降の部分は、ブラウザの仕様により **「サーバーには送信されない」** という特性があります。鍵の情報はスマホのブラウザ内だけで処理され、ネットワーク上のサーバー（中継器）には一切届きません。

---

## 3. クライアントサイドでの復号
拡張機能は、サーバーから「暗号化されたデータの塊」のみを受け取ります。これを平文に戻す（復号する）処理は、拡張機能のバックグラウンドプロセス内で行われます。

**証拠コード: `background.js`**
```javascript
// 43行目付近: 復号処理の核心
async function decrypt(payload) {
  // payload.ciphertext（暗号文）と payload.iv（初期化ベクトル）のみを受け取る
  if (!payload.ciphertext || !payload.iv) return payload.text || "";
  
  try {
    const key = await getDecryptionKey(); // ローカルから鍵をインポート
    const iv = Uint8Array.from(safeAtob(payload.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), c => c.charCodeAt(0));

    // Web Crypto API による AES-GCM 復号
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    
    // 復号された平文のみをアクティブなタブへ送信
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // 鍵が正しくない場合、中身を読み取ることは暗号学的に不可能
    return "[Decryption Error]";
  }
}
```
サーバーは意味を持たない暗号文（`ciphertext`）を転送しているだけで、その内容を読み取る数学的な手段を持ちません。

---

## 4. 結論
以上の実装により、以下の安全性が技術的に担保されています。

1.  **鍵の独占**: ユーザーのデバイス間（PCとスマホ）以外に鍵は存在しません。
2.  **安全な通信**: 鍵本体がネットワーク（インターネット）を流れることはありません。
3.  **透明性の担保**: 拡張機能がオープンソースであるため、上記の実装に嘘がないことを誰でも検証可能です。

---

## 5. ストア版とGitHubのコードが同一か確認する方法
「GitHubのコードは綺麗だが、ストアで配布されているものは中身が違うのではないか？」という疑問は、以下の手順でユーザー自身が解消できます。

### A. ローカルに保存されたソースコードを確認する
Chromeウェブストアからインストールした拡張機能のソースコードは、あなたのPCの以下のディレクトリに保存されています。

- **Windows**: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\omdfoongpifbbhapnpbocfoijkglegpd`
- **Mac**: `~/Library/Application Support/Google/Chrome/Default/Extensions/omdfoongpifbbhapnpbocfoijkglegpd`
- **Linux**: `~/.config/google-chrome/Default/Extensions/omdfoongpifbbhapnpbocfoijkglegpd`

このフォルダ内の JS ファイル（`background.js`, `content.js` 等）を開き、GitHub 上のコードと比較してみてください。VoiceMux Bridge はコードの難読化（読みづらくする処理）を行っていないため、そのまま比較が可能です。

### B. 実行中のバックグラウンドコードを見る
1. ブラウザで `chrome://extensions` を開きます。
2. VoiceMux Bridge の **「サービス ワーカー」** リンクをクリックします。
3. デベロッパーツールが開き、現在動作している `background.js` のソースを直接確認できます。

VoiceMux Bridge は、技術的な誠実さを透明性によって証明します。

---
*最終更新: 2026-02-21 (v2.1.0)*
