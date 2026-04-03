# Standalone Export Release Checklist

## Source of Truth

- Canonical source repo: `/home/kohei/Workspace/voicemux-ecosystem/voicemux-bridge`
- Standalone export target: `/home/kohei/Workspace/voicemux-bridge-standalone`
- Export command:
- Preferred release-check command:

```bash
cd /home/kohei/Workspace/voicemux-ecosystem/voicemux-bridge && \
npm run release:standalone
```

This runs source tests, exports the standalone mirror, runs standalone tests, and prints the standalone repo diff summary.

- Raw export command:

```bash
cd /home/kohei/Workspace/voicemux-ecosystem/voicemux-bridge && \
npm run export:standalone
```

The export script copies the extension code, packaging files, shared docs, and tests from the source repo into this standalone repo.

## What The Export Updates

- Runtime and UI files such as `background.js`, `content.js`, `popup.js`, `popup.html`, `options.js`, and `options.html`
- Packaging files such as `manifest.json`, `package.json`, and `package-lock.json`
- Shared extension docs such as the changelog, user guide, E2EE notes, reset-room spec, and community adapters doc
- Shared assets and tests such as `_locales/`, `icon128.png`, and `tests/`

## What Is Intentionally Excluded

- `README.md`
- `PRIVACY.md`
- `STORE_DESCRIPTION_EN.txt`
- `STORE_DESCRIPTION_JA.txt`
- `docs/WHY_PERMISSIONS_EN.md`
- `docs/WHY_PERMISSIONS_JA.md`
- `.github/`
- `TODO.md`

These files remain standalone-owned because they are store-facing, release-facing, or local process notes rather than shared extension source.

## Release Explanation Template

Use this structure when preparing a release note, PR body, or handoff:

1. What changed: summarize the exported upstream code and user-visible behavior changes.
2. What was intentionally excluded: call out any standalone-owned docs or store copy that were left untouched.
3. What must be reviewed: list manifest/version values, permission wording, store description, and any auth/pairing URL changes.

## Pre-Push And Store Submission Checks

1. Run `npm run lint` in the source repo when code style changed.
2. Run `npm run release:standalone` in the source repo.
3. Check `manifest.json` and confirm the popup shows the public store version, not the internal build suffix.
4. Review standalone-owned files for release accuracy: `README.md`, `PRIVACY.md`, `STORE_DESCRIPTION_EN.txt`, `STORE_DESCRIPTION_JA.txt`, and `docs/WHY_PERMISSIONS_*.md`.
5. Inspect the standalone git diff and confirm it only contains the expected exported changes plus any intentional standalone doc updates.
6. Commit and push the standalone repo only after the diff and version metadata look correct.
7. Package or submit to the Chrome Web Store only after the public GitHub repo is current.
