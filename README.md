# VoiceMux Bridge 🛰️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](#english) | [日本語](#japanese)

---

<a name="english"></a>
## English

**VoiceMux Bridge** is the open-source Chrome extension for the VoiceMux ecosystem. It turns your smartphone into a secure, E2EE-encrypted remote keyboard for AI agents (Gemini, ChatGPT, Claude, etc.).

### 🔐 Security & Privacy (E2EE)
This extension features true Client-Side End-to-End Encryption (E2EE).
- **Zero-Knowledge**: Your encryption keys (AES-GCM 256-bit) are generated locally and stored in `chrome.storage.local`. They never touch the server.
- **Hash-based Key Exchange**: Keys are shared with your mobile device via URL hash fragments (`#key=...`), which are handled exclusively by the browser and never transmitted over the network.
- **Auditable**: All security logic is open for public audit in this repository.

### 🛡️ Transparency & Permissions
We provide full disclosure on our implementation and technical decisions:
- [**Changelog**: Release history](docs/CHANGELOG.md)
- [**Transparency Report**: Why we need "Access to All Sites"](docs/WHY_PERMISSIONS_EN.md)
- [**E2EE Implementation**: Technical Proof of Privacy](docs/E2EE_IMPLEMENTATION_EN.md)
- [**Dev Log**: AI Consultation about Security Warnings](docs/DEVELOPMENT_LOG_AI_CONSULTATION_EN.md)

### 🚀 Features
- **One-Tap Pairing**: Click the extension icon to show a QR code for instant, secure pairing.
- **Atomic Submit**: Bundles text injection and send actions to ensure reliability even on complex React-based SPAs.
- **Custom Site Adapters**: Add support for any website by defining your own CSS selectors.
- **Universal Compatibility**: Falls back to the active element if no specific site adapter matches.

### 🛠️ How to Install
1. Install from the [**Chrome Web Store**](https://chromewebstore.google.com/detail/voicemux-bridge/agkglknmadfhdfobmgecllpgoecebdip).
2. **Crucial:** **Refresh (Reload) any tabs** you already have open (like ChatGPT or Gemini) to activate the bridge.
3. Click the extension icon to pair with your phone.

### 👤 Developer
VoiceMux Bridge is developed by **Kaneta**, a developer with extensive experience in Android app development and a passion for bridging mobile utility to the desktop.
- [**Google Play Store Profile**](https://play.google.com/store/apps/developer?id=Kaneta): Check out my other mobile applications.
- [**GitHub Profile**](https://github.com/Kaneta): View my open-source contributions.

### 🍃 Sustainability & Philosophy
- **Why is it free?**: VoiceMux leverages the power of your own smartphone and uses low-overhead, E2EE-encrypted relaying. This minimizes our server costs, allowing us to provide the core experience for free.
- **Future-Proof**: This project is developed 100% with AI assistance (**Gemini**). This ensures that the logic is standardized and well-documented. The knowledge required to maintain or even recreate the relay infrastructure is not "locked" in one person's head.

---

<a name="japanese"></a>
## 日本語

**VoiceMux Bridge** は、スマートフォンを AI エージェント（Gemini, ChatGPT, Claude 等）のセキュアなリモートキーボードに変えるための、オープンソースの Chrome 拡張機能です。

### 🔐 セキュリティ & プライバシー (E2EE)
本拡張機能は、真のクライアントサイド・エンドツーエンド暗号化（E2EE）を実装しています。
- **ゼロ・ナレッジ**: 暗号鍵（AES-GCM 256-bit）はローカルで生成され、`chrome.storage.local` に保存されます。サーバーに鍵が送られることはありません。
- **ハッシュベースの鍵共有**: 鍵は URL のハッシュフラグメント（`#key=...`）を介してスマホと共有されます。この部分はブラウザの仕様上、ネットワーク（サーバー）を流れることはありません。
- **監査可能**: すべてのセキュリティロジックは本リポジトリで公開されており、誰でも監査可能です。

### 🛡️ 透明性と権限について
実装内容や技術的な意思決定について、詳細なレポートを公開しています：
- [**更新履歴**: 過去の変更点](docs/CHANGELOG_JA.md)
- [**透明性レポート**: なぜ「全サイトへのアクセス権限」が必要なのか](docs/WHY_PERMISSIONS_JA.md)
- [**E2EE実装レポート**: プライバシー保護の技術的証明](docs/E2EE_IMPLEMENTATION_JA.md)
- [**開発ログ**: セキュリティ警告についてAIと相談した記録](docs/DEVELOPMENT_LOG_AI_CONSULTATION.md)

### 🚀 特徴
- **ワンタップ・ペアリング**: アイコンをクリックして表示される QR コードをスキャンするだけで、瞬時かつ安全に接続。
- **アトミック・サブミット**: テキストの注入と送信アクションをセットで行い、複雑な React アプリ等でも確実に動作。
- **カスタム・アダプター**: 独自の CSS セレクターを定義して、あらゆるサイトの入力欄をサポート可能。
- **ユニバーサル互換性**: 特定の設定がないサイトでも、現在フォーカスされている入力欄へ自動挿入。

### 🛠️ インストール方法
1. [**Chrome ウェブストア**](https://chromewebstore.google.com/detail/voicemux-bridge/agkglknmadfhdfobmgecllpgoecebdip) からインストールします。
2. **重要:** すでに開いているタブ（ChatGPTやGeminiなど）で利用するには、そのページを **一度再読み込み（リロード）** してください。
3. 拡張機能のアイコンをクリックして、スマホとペアリングを開始します。

### 👤 開発者
開発者: **Kaneta**。Android アプリ開発の経験を活かし、モバイルの利便性をデスクトップへ拡張することに情熱を注いでいます。
- [**Google Play デベロッパー プロフィール**](https://play.google.com/store/apps/developer?id=Kaneta): 公開中の Android アプリはこちら。
- [**GitHub プロフィール**](https://github.com/Kaneta): オープンソースでの活動はこちら。

### 🍃 持続可能性と哲学
- **なぜ無料なのですか？**: VoiceMux は「ユーザー自身のスマホの処理能力」と「E2EEによる低負荷な中継」を組み合わせることで、運営側のサーバーコストを極限まで抑えています。このため、基本機能を無料で提供し続けることが可能です。
- **継続性の担保**: 本プロジェクトは 100% AI（**Gemini**）との対話を通じて制作されています。コードの構造が標準化され、開発の意図が明確に記録されているため、誰でもサーバーを再構築したり維持したりすることが比較的容易です。

---

## 📄 License
MIT License - see the [LICENSE](LICENSE) file for details.
