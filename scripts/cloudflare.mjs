#!/usr/bin/env node
/**
 * Runs any CLI command with Cloudflare credentials injected from
 * `.cloudflare-secrets.json` (gitignored — never commit this file).
 *
 *   node scripts/cloudflare.mjs npx wrangler whoami
 *   node scripts/cloudflare.mjs npx wrangler d1 create feather
 *   node scripts/cloudflare.mjs npx opennextjs-cloudflare deploy
 *
 * The secrets file shape:
 *   { "apiToken": "…", "accountId": "…" }
 *
 * On Windows, `npx`/`npm` are .cmd shims that cannot be spawned directly
 * with shell:false (Node throws EINVAL). Known CLIs are instead invoked
 * directly through `node`, which is both faster and more reliable.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const secretsPath = resolve(process.cwd(), ".cloudflare-secrets.json");
const env = { ...process.env };

if (existsSync(secretsPath)) {
  try {
    const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
    if (secrets.apiToken) env.CLOUDFLARE_API_TOKEN = secrets.apiToken;
    if (secrets.accountId) env.CLOUDFLARE_ACCOUNT_ID = secrets.accountId;
  } catch (err) {
    console.error("Could not read .cloudflare-secrets.json:", err.message);
    process.exit(1);
  }
} else {
  console.error("Missing .cloudflare-secrets.json — create it with { \"apiToken\": \"…\", \"accountId\": \"…\" }");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/cloudflare.mjs <command> [args...]");
  process.exit(1);
}

let [cmd, ...rest] = args;

// Map known CLIs to their real JS entry points so we can spawn `node`
// directly and avoid Windows .cmd shim issues entirely.
const KNOWN_BINS = {
  "opennextjs-cloudflare": "node_modules/@opennextjs/cloudflare/dist/cli/index.js",
  "wrangler": "node_modules/wrangler/bin/wrangler.js",
  "cf-wrangler": "node_modules/wrangler/bin/wrangler.js",
  "wrangler2": "node_modules/wrangler/bin/wrangler.js",
};

if (cmd === "npx" || cmd === "npm") {
  // `npx opennextjs-cloudflare build` -> `node <bin> build`
  // `npm exec -- wrangler ...`        -> `node <bin> ...`
  let argsToScan = rest;
  if (cmd === "npm" && argsToScan[0] === "exec") {
    argsToScan = argsToScan.slice(1);
    if (argsToScan[0] === "--") argsToScan = argsToScan.slice(1);
  }
  const pkg = argsToScan[0];
  const bin = KNOWN_BINS[pkg];
  if (bin) {
    cmd = process.execPath; // absolute path to node
    rest = [resolve(process.cwd(), bin), ...argsToScan.slice(1)];
  }
}

if (process.platform === "win32" && !cmd.includes(".") && !cmd.includes("\\") && !cmd.includes("/")) {
  // Non-standard command name — fall back to the .cmd shim, spawned via
  // cmd.exe to avoid the EINVAL issue with direct .cmd spawning.
  const { ComSpec } = process.env;
  cmd = ComSpec || "cmd.exe";
  rest = ["/d", "/s", "/c", `${args.join(" ")}`];
}

const child = spawn(cmd, rest, {
  stdio: "inherit",
  shell: false,
  env,
});
child.on("error", (err) => {
  console.error("Failed to spawn", cmd, err.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
