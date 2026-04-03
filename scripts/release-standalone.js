const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE_ROOT = path.resolve(__dirname, "..");
const STANDALONE_ROOT =
  process.env.VOICEMUX_STANDALONE_REPO ||
  path.resolve(SOURCE_ROOT, "..", "..", "voicemux-bridge-standalone");

function ensureDirectory(root, label) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`${label} directory not found: ${root}`);
  }
}

function runStep(label, command, args, cwd) {
  process.stdout.write(`\n[${label}] ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function printSummary() {
  process.stdout.write("\n[summary] standalone repo status\n");
  spawnSync("git", ["status", "--short"], {
    cwd: STANDALONE_ROOT,
    stdio: "inherit",
    env: process.env
  });

  process.stdout.write("\n[summary] standalone repo diff stat\n");
  spawnSync("git", ["diff", "--stat"], {
    cwd: STANDALONE_ROOT,
    stdio: "inherit",
    env: process.env
  });
}

function main() {
  ensureDirectory(SOURCE_ROOT, "Source repo");
  ensureDirectory(STANDALONE_ROOT, "Standalone repo");

  runStep("source-test", "npm", ["test"], SOURCE_ROOT);
  runStep("export-standalone", "node", ["scripts/export-standalone.js"], SOURCE_ROOT);
  runStep("standalone-test", "npm", ["test"], STANDALONE_ROOT);
  printSummary();

  process.stdout.write(
    "\n[done] review the standalone diff, then commit and push the public repo if the mirror should be updated.\n"
  );
}

main();
