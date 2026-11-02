// Full E2E of the share-link reader flow against the deployed worker.
// Usage: node scripts/e2e-share.mjs <admin-password>
const BASE = "https://scribo.ir";
const adminPass = process.argv[2];
if (!adminPass) {
  console.error("Usage: node scripts/e2e-share.mjs <admin-password>");
  process.exit(1);
}

// ---------- tiny cookie jar ----------
const jar = {}; // name -> value
function jarHeaders() {
  const parts = Object.entries(jar).map(([k, v]) => `${k}=${v}`);
  return parts.length ? { Cookie: parts.join("; ") } : {};
}
function absorb(resp) {
  for (const sc of resp.headers.getSetCookie()) {
    const [pair] = sc.split(";");
    const i = pair.indexOf("=");
    jar[pair.slice(0, i)] = pair.slice(i + 1);
  }
}

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!cond) failures++;
}

async function req(path, { method = "GET", body, expect } = {}) {
  const headers = { ...jarHeaders(), "Content-Type": "application/json" };
  const resp = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  absorb(resp);
  const text = await resp.text();
  if (expect && resp.status !== expect) {
    console.log(`  -> ${method} ${path} expected ${expect}, got ${resp.status}: ${text.slice(0, 120)}`);
  }
  return { resp, status: resp.status, text };
}

// ---------- 1. login ----------
{
  const { status } = await req("/api/auth/login", {
    method: "POST",
    body: { username: "admin", password: adminPass },
    expect: 200,
  });
  check("admin login 200", status === 200);
  check("session cookie set", "scribo_session" in jar);
}

// ---------- 2. create text + chapter + publish version ----------
const title = `E2E-${Date.now()}`;
let textId, chapterId;
{
  const r = await req("/api/texts", { method: "POST", body: { title }, expect: 201 });
  textId = JSON.parse(r.text).id;
  check("create text", !!textId, textId);
}
{
  const r = await req(`/api/texts/${textId}/chapters`, {
    method: "POST",
    body: { title: "فصل آزمون" },
    expect: 201,
  });
  chapterId = JSON.parse(r.text).chapter.id;
  check("create chapter", !!chapterId, chapterId);
}
let bodyMarker;
{
  const bodyJson = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "سلام دنیا — جامعهٔ آزمون." }] },
      { type: "paragraph", content: [{ type: "text", text: "دومین پاراگراف برای خواندن." }] },
    ],
  };
  bodyMarker = "سلام دنیا";
  const { status } = await req(`/api/chapters/${chapterId}/versions`, {
    method: "POST",
    body: { title: "فصل آزمون", bodyJson: JSON.stringify(bodyJson) },
    expect: 201,
  });
  check("publish chapter version", status === 201);
}

// ---------- 3. create share link with password + greeting ----------
const sharePass = "secret-reader-123";
let linkId, shareUrlPath, token, greeting;
{
  const r = await req(`/api/texts/${textId}/links`, {
    method: "POST",
    body: {
      label: "جان",
      greeting: "سلام جان! ممنون که می‌خوانی.",
      password: sharePass,
    },
    expect: 201,
  });
  const link = JSON.parse(r.text).link;
  linkId = link.id;
  greeting = link.greeting;
  check("link has absolute url", /^https?:\/\//.test(link.url), link.url);
  shareUrlPath = new URL(link.url).pathname; // /r/<token>
  token = shareUrlPath.split("/").pop();
  check("link has password", link.hasPassword === true);
  console.log(`  link: ${link.url}`);
}

// ---------- 4. reader gated (no cookie) ----------
{
  const r = await req(shareUrlPath);
  check("locked: 200 lock screen", r.status === 200);
  check("locked: no TOC yet", !r.text.includes(title));
  check("locked: greeting shown", !!greeting && r.text.includes("سلام جان"));
}

// ---------- 5. unlock with correct password ----------
{
  const { status } = await req("/api/r/unlock", {
    method: "POST",
    body: { token, password: sharePass },
    expect: 200,
  });
  check("unlock 200", status === 200);
  const cookieName = Object.keys(jar).find((k) => k.startsWith("fr_"));
  check("reader cookie set", !!cookieName, cookieName || "(none)");
}

// ---------- 6. wrong password rejected ----------
{
  const { status } = await req("/api/r/unlock", {
    method: "POST",
    body: { token, password: "nope" },
    expect: 401,
  });
  check("wrong password 401", status === 401);
}

// ---------- 7. unlocked reader home + TOC ----------
{
  const r = await req(shareUrlPath);
  check("unlocked: 200", r.status === 200);
  check("unlocked: title present", r.text.includes(title));
}

// ---------- 8. read chapter ----------
{
  const path = `${shareUrlPath}/chapters/${chapterId}`;
  const r = await req(path);
  check("chapter page 200", r.status === 200, `(${path})`);
  check("chapter content rendered", r.text.includes(bodyMarker));
  check("noindex robots meta", /noindex/.test(r.text));
  check("reader page card present", r.text.includes("reader-page"));
  check("reader toolbar present", r.text.includes("A+") && r.text.includes("%"));
}

// ---------- 8b. comments: moderation flow ----------
const commentBody = "دیدگاه آزمایشی برای تأیید.";
let commentId;
{
  // Locked reader (no unlock cookie) cannot comment.
  const readerCookie = Object.keys(jar).find((k) => k.startsWith("fr_"));
  const saved = readerCookie ? jar[readerCookie] : undefined;
  if (readerCookie) delete jar[readerCookie];
  const r = await req("/api/r/comments", {
    method: "POST",
    body: { token, chapterId, name: "علی", email: "ali@example.com", body: commentBody },
  });
  check("comment without unlock -> 403", r.status === 403);
  if (readerCookie && saved) jar[readerCookie] = saved;
}
{
  const r = await req("/api/r/comments", {
    method: "POST",
    body: { token, chapterId, name: "علی", email: "ali@example.com", body: commentBody },
    expect: 201,
  });
  const data = JSON.parse(r.text);
  check("comment submitted (pending, no autoApprove)", data.status === "pending");
}
{
  const r = await req(`/api/comments?textId=${textId}`);
  check("admin comment list 200", r.status === 200);
  const list = JSON.parse(r.text).comments;
  const c = list.find((x) => x.body === commentBody);
  check("comment in admin queue as pending", !!c && c.status === "pending");
  commentId = c?.id;
}
{
  const r = await req(`/api/comments/${commentId}`, {
    method: "PATCH",
    body: { status: "approved" },
    expect: 200,
  });
  check("admin approve comment 200", r.status === 200);
}
{
  const r = await req(`${shareUrlPath}/chapters/${chapterId}`);
  check("approved comment rendered on chapter", r.text.includes(commentBody));
  check("comment author name rendered", r.text.includes("علی"));
}
{
  // Honeypot filled -> silently accepted, nothing stored.
  const r = await req("/api/r/comments", {
    method: "POST",
    body: { token, chapterId, name: "bot", body: "spam", website: "http://spam.example" },
  });
  check("honeypot silently accepted", r.status === 200);
}
{
  const r = await req("/api/r/comments", {
    method: "POST",
    body: { token, chapterId, name: "x", email: "not-an-email", body: "y" },
  });
  check("invalid email rejected 400", r.status === 400);
}
{
  // autoApprove link: comment is visible immediately, no moderation needed.
  const r = await req(`/api/texts/${textId}/links`, {
    method: "POST",
    body: { label: "آزاد", autoApproveComments: true },
    expect: 201,
  });
  const link2 = JSON.parse(r.text).link;
  const t2 = new URL(link2.url).pathname.split("/").pop();
  const cr = await req("/api/r/comments", {
    method: "POST",
    body: { token: t2, chapterId, name: "زهرا", email: "z@example.com", body: "دیدگاه خودکار تأیید." },
    expect: 201,
  });
  check("autoApprove comment -> approved", JSON.parse(cr.text).status === "approved");
  const chapter2 = await req(`${shareUrlPath}/chapters/${chapterId}`);
  check("auto-approved comment visible immediately", chapter2.text.includes("دیدگاه خودکار تأیید."));
}

// ---------- 9. regenerate -> old token 404s, got new token ----------
let regeneratedToken;
{
  const r = await req(`/api/texts/${textId}/links/${linkId}/regenerate`, {
    method: "POST",
    expect: 200,
  });
  const url = JSON.parse(r.text).link.url;
  regeneratedToken = new URL(url).pathname.split("/").pop();
  check("regenerate produced new token", !!regeneratedToken && regeneratedToken !== token, regeneratedToken);
  const old = await req(shareUrlPath);
  check("old token now 404", old.status === 404, `got ${old.status}`);
}

// ---------- 10. revoke -> gentle message ----------
{
  await req(`/api/texts/${textId}/links/${linkId}`, {
    method: "PATCH",
    body: { status: "revoked" },
    expect: 200,
  });
  const r = await req(`/r/${regeneratedToken}`);
  check("revoked: available", r.status === 200);
  check("revoked: gentle message", r.text.includes("این لینک دیگر فعال نیست"));
}

// ---------- 11. reactivate -> locked again (cookie was minted for old token) ----------
{
  await req(`/api/texts/${textId}/links/${linkId}`, {
    method: "PATCH",
    body: { status: "active" },
    expect: 200,
  });
  const r = await req(`/r/${regeneratedToken}`);
  check("reactivated: lock screen (old cookie vs new token)", r.status === 200 && !r.text.includes(title));
}

// ---------- 12. wrong token -> 404 ----------
{
  const r = await req("/r/thisisnotarealtoken123456");
  check("garbage token 404", r.status === 404, `got ${r.status}`);
}

// ---------- 13. landing hero images still served ----------
for (const img of [
  "hero/hero-pc-darkmode.jpg",
  "hero/hero-mobile-darkmode.jpg",
  "hero/hero-pc.webp",
  "hero/hero-mobile.webp",
  "hero/og-cover.jpg",
]) {
  const resp = await fetch(`${BASE}/${img}`);
  check(`hero image 200 (${img})`, resp.status === 200, resp.headers.get("content-type") || "");
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
