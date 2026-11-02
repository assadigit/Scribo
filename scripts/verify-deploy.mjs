// Diagnostic probing of the deployed auth flow.
// Usage: node scripts/verify-deploy.mjs <admin-password>
const BASE = "https://scribo.ir";
const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/verify-deploy.mjs <admin-password>");
  process.exit(1);
}

async function tryLogin(username, pw) {
  const r = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: pw }),
    redirect: "manual",
  });
  const text = await r.text();
  const sc = r.headers.get("set-cookie") || "(none)";
  console.log(
    `login(${username}, ${pw ? "provided" : "missing"}) -> ${r.status} | body: ${text.slice(0, 80)} | set-cookie: ${sc.slice(0, 40)}`
  );
  return r;
}

// 1) Wrong username (route reachable? returns 401 not 500?)
await tryLogin("nosuchuser", "whatever123");

// 2) Correct credentials
await tryLogin("admin", password);

// 3) Missing fields (should 400)
await tryLogin("", "");
