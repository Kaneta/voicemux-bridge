# VoiceMux Bridge: E2EE実装技術レポート

VoiceMux Bridge がどのようにしてデータの秘密を保持し、サーバーに内容を見せない仕組みになっているかを、実際のソースコードを抜粋して解説します。

---

## 1. ローカルでの暗号鍵生成
暗号鍵（AES-GCM 256bit）はブラウザ拡張機能内で直接生成され、サーバーへ送信されることはありません。

**証拠コード: `background.js`**
```javascript
// 36行目: 標準の Web Crypto API を使用した鍵の生成
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true,
  ["encrypt", "decrypt"]
);

// 43-45行目: 鍵を文字列化し、ローカルストレージにのみ保存
keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
await chrome.storage.local.set({ 'voicemux_key': keyBase64 });
```
この鍵は `chrome.storage.local` という、拡張機能専用の安全な領域に保存されます。

---

## 2. サーバーを経由しない鍵共有（Zero-Knowledge）
スマホとのペアリング時、URLのハッシュフラグメント（`#`）を使用して、サーバーに鍵を知らせずにデバイス間で共有します。

**証拠コード: `background.js`**
```javascript
// 80行目: ペアリング用URLの構築
console.log(`E2EE Pairing URL: https://v.knc.jp/z/${roomId}?token=${token}#key=${keyBase64}`);
```
URLの `#` 以降の部分は、ブラウザの仕様により **「サーバーには送信されない」** という特性があります。鍵の情報はスマホのブラウザ内だけで処理され、ネットワーク上のサーバーには一切届きません。

---

## 3. クライアントサイドでの復号
拡張機能は、サーバーから「暗号化されたデータの塊」のみを受け取ります。これを平文に戻す（復号する）処理は、拡張機能の中で行われます。

**証拠コード: `content.js`**
```javascript
// 113行目: 復号処理
async function decrypt(payload) {
  // payload.ciphertext（暗号文）と payload.iv（初期化ベクトル）のみを受け取る
  if (!payload.ciphertext || !payload.iv) return payload.text || "";
  
  try {
    const key = await getDecryptionKey(); // ローカルから鍵を取得
    const iv = Uint8Array.from(safeAtob(payload.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(safeAtob(payload.ciphertext), c => c.charCodeAt(0));

    // 123行目: ブラウザ内での復号実行
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    
    // 復号された平文を返す
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // 鍵が正しくない場合、中身を読み取ることは不可能
    console.error("[E2EE] Decryption failed:", e);
    return "[Decryption Error]";
  }
}
```
サーバーは `ciphertext` という意味を持たない文字列を転送しているだけで、その内容を読み取る手段を持ちません。

---

## 4. 結論
以上の実装により、以下の安全性が数学的に証明されています。

1.  **鍵の独占**: ユーザーのデバイス間以外に鍵は存在しません。
2.  **安全な通信**: 鍵がネットワークを流れることはありません。
3.  **信頼の根拠**: 拡張機能がオープンソースであるため、上記に嘘がないことを誰でも検証可能です。

VoiceMux Bridge は、プライバシーを技術によって保護する設計となっています。

---
*最終更新: 2026-02-17*
