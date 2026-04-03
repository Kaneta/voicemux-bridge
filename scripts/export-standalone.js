const fs = require("node:fs");
const path = require("node:path");

const CURRENT_ROOT = path.resolve(__dirname, "..");
const REPO_NAME = path.basename(CURRENT_ROOT);

const SOURCE_ROOT =
  REPO_NAME === "voicemux-bridge-standalone"
    ? path.resolve(
        process.env.VOICEMUX_SOURCE_REPO ||
          path.resolve(CURRENT_ROOT, "..", "voicemux-ecosystem", "voicemux-bridge")
      )
    : CURRENT_ROOT;

const STANDALONE_ROOT =
  REPO_NAME === "voicemux-bridge-standalone"
    ? CURRENT_ROOT
    : path.resolve(
        process.env.VOICEMUX_STANDALONE_REPO ||
          path.resolve(CURRENT_ROOT, "..", "..", "voicemux-bridge-standalone")
      );

const SHARED_PATHS = [
  ".github",
  "_locales",
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "STORE_DESCRIPTION_EN.txt",
  "STORE_DESCRIPTION_JA.txt",
  "adapters.json",
  "background-auth-state.js",
  "background-connection-logic.js",
  "background-crypto.js",
  "background-relay-coordinator.js",
  "background-relay-runtime.js",
  "background-relay-session.js",
  "background-runtime-messages.js",
  "background-tabs.js",
  "background-telemetry.js",
  "background.js",
  "content.js",
  "docs/CHANGELOG.md",
  "docs/CHANGELOG_JA.md",
  "docs/E2EE_IMPLEMENTATION_EN.md",
  "docs/E2EE_IMPLEMENTATION_JA.md",
  "docs/RESET_ROOM_SPEC_JA.md",
  "docs/WHY_PERMISSIONS_EN.md",
  "docs/WHY_PERMISSIONS_JA.md",
  "docs/USER_GUIDE_EN.md",
  "docs/USER_GUIDE_JA.md",
  "docs/community-adapters.md",
  "eslint.config.mjs",
  "icon128.png",
  "manifest.json",
  "options.html",
  "options.js",
  "package-lock.json",
  "package.json",
  "popup.html",
  "popup.js",
  "scripts/export-standalone.js",
  "tests"
];

// Internal store-listing mock assets must stay out of the standalone repo.
// Keep them under paths such as `.store/` and do not add those paths here.
const STANDALONE_ONLY_PATHS = [
  "TODO.md",
  "docs/STANDALONE_EXPORT_RELEASE.md"
];

function assertDirectoryExists(root, label) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`${label} directory not found: ${root}`);
  }
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function removeTarget(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyEntry(relativePath) {
  const sourcePath = path.join(SOURCE_ROOT, relativePath);
  const targetPath = path.join(STANDALONE_ROOT, relativePath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Shared path is missing in source repo: ${relativePath}`);
  }

  removeTarget(targetPath);
  ensureParentDir(targetPath);
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function main() {
  assertDirectoryExists(SOURCE_ROOT, "Source repo");
  assertDirectoryExists(STANDALONE_ROOT, "Standalone repo");

  SHARED_PATHS.forEach(copyEntry);

  process.stdout.write(`Exported ${SHARED_PATHS.length} shared paths to ${STANDALONE_ROOT}\n`);
  process.stdout.write("Standalone-owned paths remain untouched:\n");
  STANDALONE_ONLY_PATHS.forEach((relativePath) => {
    process.stdout.write(`- ${relativePath}\n`);
  });
}

main();
