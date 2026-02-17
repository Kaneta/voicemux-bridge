# VoiceMux Bridge 🛰️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**VoiceMux Bridge** is the open-source Chrome extension for the VoiceMux ecosystem. It turns your smartphone into a secure, E2EE-encrypted remote keyboard for AI agents (Gemini, ChatGPT, Claude, etc.).

## 🔐 Security & Privacy (E2EE)
This extension features true Client-Side End-to-End Encryption (E2EE).
- **Zero-Knowledge**: Your encryption keys (AES-GCM 256-bit) are generated locally and stored in `chrome.storage.local`. They never touch the server.
- **Hash-based Key Exchange**: Keys are shared with your mobile device via URL hash fragments (`#key=...`), which are handled exclusively by the browser and never transmitted over the network to the server.
- **Auditable**: All security logic is open for public audit in this repository.

### 🛡️ Transparency & Permissions
We understand that Chrome's "Read and change all data" warning can be intimidating. We provide full disclosure on why this is necessary:
- [**Transparency Report**: Why we need "Access to All Sites"](docs/WHY_PERMISSIONS_EN.md)
- [**E2EE Implementation**: Technical Proof of Privacy](docs/E2EE_IMPLEMENTATION_EN.md)
- [**Dev Log**: AI Consultation about Security Warnings](docs/DEVELOPMENT_LOG_AI_CONSULTATION_EN.md)

インストール時の権限に関する警告については、以下のレポートをご確認ください：
- [**透明性レポート**: なぜ「全サイトへのアクセス権限」が必要なのか](docs/WHY_PERMISSIONS_JA.md)
- [**E2EE実装レポート**: プライバシー保護の技術的証明](docs/E2EE_IMPLEMENTATION_JA.md)
- [**開発ログ**: セキュリティ警告についてAIと相談した記録](docs/DEVELOPMENT_LOG_AI_CONSULTATION.md)

## 🚀 Features
- **One-Tap Pairing**: Click the extension icon to show a QR code for instant, secure pairing.
- **Atomic Submit**: Bundles text injection and send actions to ensure reliability even on complex React-based SPAs.
- **Custom Site Adapters**: Add support for any website by defining your own CSS selectors in the Extension Options page.
- **Community Catalog**: Access pre-made configurations for Outlook, Slack, Notion, and more via our [Community Adapters Catalog](community-adapters.md).
- **Universal Compatibility**: Falls back to the active element if no specific site adapter matches.

## 🛠️ How to Install (Developer Mode)
1. Clone this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the `voicemux-bridge` folder.

## 👤 Developer / 開発者
VoiceMux Bridge is developed by **Kaneta**, a developer with extensive experience in Android app development and a passion for bridging mobile utility to the desktop.
- [**Google Play Store Profile**](https://play.google.com/store/apps/developer?id=Kaneta): Check out my other mobile applications.
- [**GitHub Profile**](https://github.com/Kaneta): View my open-source contributions.

### 🍃 Sustainability & Philosophy / 持続可能性と哲学
- **Why is it free?**: VoiceMux leverages the power of your own smartphone and uses low-overhead, E2EE-encrypted relaying. This minimizes our server costs, allowing us to provide the core experience for free.
- **Future-Proof**: This project is developed 100% with AI assistance (**Gemini**). This ensures that the logic is standardized and well-documented. The knowledge required to maintain or even recreate the relay infrastructure is not "locked" in one person's head, making it easier for the community to sustain the project if needed.
- **Commitment**: Our core goal is to provide the "fastest input experience." While we may introduce premium features (like advanced dictionary sync) in the future to support growth, the essential "Phone-to-PC" bridge will remain accessible.

- **なぜ無料なのですか？**: VoiceMux は「ユーザー自身のスマホの処理能力」と「E2EEによる低負荷な中継」を組み合わせることで、サーバーコストを極限まで抑えています。この設計により、基本機能を無料で提供し続けることが可能です。
- **継続性の担保**: 本プロジェクトは 100% AI（**Gemini**）との対話を通じて制作されています。コードの構造が標準化されており、開発の意図が明確に記録されているため、万が一私がメンテナンスを継続できなくなった場合でも、他の誰かがサーバーを再構築したり維持したりすることが比較的容易です。
- **想い**: 私が何より大切にしているのは「思考を妨げない最高の入力体験」です。将来的にサービスを維持・拡張するための仕組みを導入する可能性はありますが、今の基本機能が突然使えなくなるようなことはありません。

## 📄 License
MIT License - see the [LICENSE](LICENSE) file for details.
