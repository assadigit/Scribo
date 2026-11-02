#!/usr/bin/env node
/**
 * Non-interactively creates (or updates) an admin account in D1. Use for
 * scripting and CI. For a console prompt use `npm run admin:create`.
 *
 *   node scripts/seed-admin.mjs admin 'secret'              # local
 *   node scripts/seed-admin.mjs admin 'secret' --remote     # production
 */
import { pbkdf2, randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { execSync } from "node:child_process";

const pbkdf2Async = promisify(pbkdf2);
const username = process.argv[2];
const password = process.argv[3];
const remote = process.argv.includes("--remote");

if (!username || !password) {
  console.error("Usage: node scripts/seed-admin.mjs <username> <password> [--remote]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const iterations = 100_000;
const salt = randomBytes(16);
const hash = await pbkdf2Async(password, salt, iterations, 32, "sha256");
const hashStr = `pbkdf2$${iterations}$${salt.toString("hex")}$${hash.toString("hex")}`;
const id = randomUUID();

const sql = `INSERT INTO admins (id, username, password_hash, created_at) VALUES ('${id}', '${username.replace(/'/g, "''")}', '${hashStr}', ${Date.now()}) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash;`;

const target = remote ? "--remote" : "--local";
try {
  execSync(`npx wrangler d1 execute feather ${target} --command "${sql.replace(/"/g, '\\"')}"`, {
    stdio: "inherit",
  });
  console.log(`\nAdmin "${username}" ${remote ? "updated (remote)" : "created (local)"}.`);
} catch (err) {
  console.error("Failed to run wrangler d1 execute:", err.message);
  process.exit(1);
}