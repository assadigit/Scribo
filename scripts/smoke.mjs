#!/usr/bin/env node
/**
 * End-to-end smoke test against a running dev/prod server.
 *
 *   node scripts/smoke.mjs
 *
 * Exercises: admin login -> create text -> add chapter -> save draft ->
 * publish version -> (auth guard on anonymous GET).
 */
const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const username = process.env.SMOKE_USER || "admin";
const password = process.env.SMOKE_PASS || "admin123";

let cookie = "";

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (cookie) h.Cookie = cookie;
  return h;
}

function collectCookies(res) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const [name] = pair.split("=");
    if (name.trim() === "scribo_session") cookie = pair.trim();
  }
}

function fail(step, res, body) {
  console.error(`✗ ${step} -> HTTP ${res.status} ${String(body).slice(0, 300)}`);
  process.exit(1);
}

const report = (step, ok) => console.log(`${ok ? "✓" : "✗"} ${step}`);

async function main() {
  // 1. unauthenticated access is rejected
  let res = await fetch(`${BASE}/api/texts`, { headers: headers() });
  if (res.status !== 401) return fail("auth guard (anonymous)", res, await res.text());
  report("anonymous access rejected (401)", true);

  // 2. login
  res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) return fail("login", res, await res.text());
  collectCookies(res);
  if (!cookie) return fail("login (no session cookie)", res, await res.text());
  report("admin login (session cookie issued)", true);

  // 3. wrong password rejected
  res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ username, password: "wrongpass1" }),
  });
  if (res.status !== 401) return fail("bad password", res, await res.text());
  report("wrong password rejected (401)", true);

  // 4. create text
  res = await fetch(`${BASE}/api/texts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title: "باران و نامه‌ها", direction: "rtl" }),
  });
  if (res.status !== 201) return fail("create text", res, await res.text());
  const { id: textId } = await res.json();
  report("create text", true);

  // 5. add chapter
  res = await fetch(`${BASE}/api/texts/${textId}/chapters`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title: "فصل اول" }),
  });
  if (res.status !== 201) return fail("add chapter", res, await res.text());
  const { chapter } = await res.json();
  report("add chapter", true);

  // 6. save draft
  const draftJson = JSON.stringify({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "سلام دنیا" }] },
    ],
  });
  res = await fetch(`${BASE}/api/chapters/${chapter.id}/draft`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ title: "فصل اول", bodyJson: draftJson }),
  });
  if (!res.ok) return fail("save draft", res, await res.text());
  report("save draft", true);

  // 7. load chapter (draft present, no versions yet)
  res = await fetch(`${BASE}/api/chapters/${chapter.id}`, { headers: headers() });
  if (!res.ok) return fail("get chapter", res, await res.text());
  const loaded = await res.json();
  if (loaded.versions.length !== 0 || !loaded.draft) return fail("get chapter shape", res, JSON.stringify(loaded));
  report("get chapter (draft, empty versions)", true);

  // 8. publish version
  res = await fetch(`${BASE}/api/chapters/${chapter.id}/versions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title: "فصل اول", bodyJson: draftJson, note: "نسخه اول" }),
  });
  if (res.status !== 201) return fail("publish version", res, await res.text());
  const { version } = await res.json();
  if (version.number !== 1) return fail("published version number", res, JSON.stringify(version));
  report("publish version #1", true);

  // 9. draft cleared after publish, current version set
  res = await fetch(`${BASE}/api/chapters/${chapter.id}`, { headers: headers() });
  const after = await res.json();
  if (after.versions.length !== 1 || !after.versions[0].isCurrent) return fail("post-publish state", res, JSON.stringify(after));
  report("draft cleared + current version set", true);

  console.log("\nAll smoke checks passed ✔");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});