#!/usr/bin/env node
/**
 * Creates an admin account in the D1 database.
 *
 *   npm run admin:create            # local (Miniflare) database
 *   npm run admin:create -- --remote # production database
 *
 * The hash format matches lib/auth.ts: pbkdf2$600000$saltHex$hashHex
 */
import { createInterface } from "node:readline/promises";
import { pbkdf2, randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { execSync } from "node:child_process";

const pbkdf2Async = promisify(pbkdf2);
const remote = process.argv.includes("--remote");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const username = (await rl.question("Username: ")).trim();
const password = await rl.question("Password: ", { hideEcho: true });
rl.close();

if (!username || !password) {
  console.error("Username and password are required.");
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
