# Maintenance & Development Guide / メンテナンス手順書

This document ensures that code changes and documentation remain synchronized. Developers (both humans and AI agents) MUST follow this checklist for every update.

コードの変更とドキュメントの整合性を保つための手順書です。開発者（人間およびAIエージェント）は、更新時に必ずこのチェックリストを確認してください。

---

## 📋 Pre-Release Checklist / 更新時チェックリスト

### 1. Version Management / バージョン管理
- [ ] **`manifest.json`**: Bump the version number (e.g., `1.6.1` -> `1.6.2`).
- [ ] **`CHANGELOG.md` & `CHANGELOG_JA.md`**: Add new entry with version, date, and changes.

### 2. E2EE Integrity / 暗号化の整合性
- [ ] **`docs/E2EE_IMPLEMENTATION_*.md`**: If logic in `background.js` or `content.js` changed, verify that the **line numbers** quoted in the reports are still correct.
- [ ] Ensure that no sensitive keys are inadvertently logged or transmitted.

### 3. Website Synchronization / 公式サイト同期
- [ ] **`knc-hub/src/lib/data.ts`**: Update the `whatsNew` section if significant features were added.
- [ ] Redeploy `knc-hub` to reflect changes on `knc.jp`.

### 4. Readme & Guides / ドキュメント更新
- [ ] **`README.md`**: Update "Features" or "Install" sections if the UI or workflow changed.
- [ ] **`docs/USER_GUIDE_*.md`**: Ensure screenshots (if any) or instructions match the current UI.

---

## 🤖 Special Instructions for AI Agents / AIへの指示

When an AI agent (like Gemini) works on this repository, it MUST:
1. **Read this file** before starting any task.
2. Treat code and documentation updates as an **atomic task**. Never commit code without corresponding doc updates.
3. Verify that all external links in the documents are still valid after any file reorganization.

AIエージェント（Gemini等）が本リポジトリで作業する際の必須ルール：
1. タスク開始前に必ず**本書を読み込む**こと。
2. コードの変更とドキュメントの更新を**アトミック（不可分）なタスク**として扱うこと。ドキュメントを更新せずにコードをコミットしてはならない。
3. ファイル構成を変更した場合は、ドキュメント内の外部リンクが有効であることを検証すること。
