// E2E of the one-page NoteComposer flow + read-session analytics against the deployed worker.
// Usage: node scripts/e2e-composer.mjs <admin-password>
const BASE = "https://scribo.ir";
const adminPass = process.argv[2];
if (!adminPass) {
  console.error("Usage: node scripts/e2e-composer.mjs <admin-password>");
  process.exit(1);
}

// ---------- tiny cookie jar ----------
const jar = {};
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
}

// ---------- 2. one-page composer: text + first chapter + version + link ----------
const title = `Composer-${Date.now()}`;
const bodyMarker = "پاراگراف آغازین از کامپوزر";
const sharePass = "composer-pass-1";
let textId, linkUrl, token, chapterId;
{
  const r = await req("/api/texts", {
    method: "POST",
    body: {
      title,
      subtitle: "زیرعنوان آزمون",
      authorNote: "یادداشت نویسنده برای خوانندگان",
      metaDescription: "متای آزمون",
      direction: "rtl",
      bodyJson: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: bodyMarker }] },
          { type: "paragraph", content: [{ type: "text", text: "پاراگراف دوم." }] },
        ],
      },
      publish: true,
      linkLabel: "جان",
      linkGreeting: "سلام جان! ممنون که می‌خوانی.",
      linkPassword: sharePass,
    },
    expect: 201,
  });
  const data = JSON.parse(r.text);
  textId = data.id;
  linkUrl = data.linkUrl;
  check("composer: text created with id", !!textId, textId);
  check("composer: linkUrl returned", /^https?:\/\//.test(linkUrl || ""), linkUrl || "(none)");
  token = new URL(linkUrl).pathname.split("/").pop();
}

// ---------- 3. text detail has the first chapter (title = text title) ----------
{
  const r = await req(`/api/texts/${textId}`);
  check("text detail 200", r.status === 200);
  const data = JSON.parse(r.text);
  check("composer: one chapter auto-created", data.chapters.length === 1, `chapters=${data.chapters.length}`);
  chapterId = data.chapters[0]?.id;
  check("composer: chapter title = text title", data.chapters[0]?.title === title);
  check("composer: authorNote stored", data.text.authorNote === "یادداشت نویسنده برای خوانندگان");
}

// ---------- 4. reader gated → unlock → chapter renders ----------
{
  const path = `/r/${token}`;
  const r = await req(path);
  check("locked: 200 lock screen", r.status === 200);
  check("locked: no title yet", !r.text.includes(title));
  const u = await req("/api/r/unlock", {
    method: "POST",
    body: { token, password: sharePass },
    expect: 200,
  });
  check("unlock 200", u.status === 200);
  const home = await req(path);
  check("unlocked: title present", home.text.includes(title));
  check("author note rendered on reader home", home.text.includes("یادداشت نویسنده برای خوانندگان"));
  const chapter = await req(`${path}/chapters/${chapterId}`);
  check("chapter renders composer body", chapter.text.includes(bodyMarker));
}

// ---------- 5. read-session analytics ----------
{
  const sessionId = "e2e-session-" + Date.now();
  // Without the unlock cookie -> 403 (fresh reader jar).
  const saved = Object.entries(jar).filter(([k]) => k.startsWith("fr_"));
  for (const [k] of saved) delete jar[k];
  const locked = await req("/api/r/session", {
    method: "POST",
    body: { token, chapterId, sessionId, action: "start", durationMs: 0 },
  });
  check("session without unlock -> 403", locked.status === 403, `got ${locked.status}`);
  for (const [k, v] of saved) jar[k] = v;

  const s1 = await req("/api/r/session", {
    method: "POST",
    body: { token, chapterId, sessionId, action: "start", durationMs: 0 },
    expect: 200,
  });
  check("session start 200", s1.status === 200);
  const s2 = await req("/api/r/session", {
    method: "POST",
    body: { token, chapterId, sessionId, action: "beat", durationMs: 45_000 },
    expect: 200,
  });
  check("session beat 200", s2.status === 200);
  const s3 = await req("/api/r/session", {
    method: "POST",
    body: { token, chapterId, sessionId, action: "end", durationMs: 62_000 },
    expect: 200,
  });
  check("session end 200", s3.status === 200);
  const bad = await req("/api/r/session", {
    method: "POST",
    body: { token, chapterId, sessionId: "e2e-bad-" + Date.now(), action: "end", durationMs: 10 },
  });
  check("session for unknown id still 200 (no-op update)", bad.status === 200);
}

// ---------- 6. dashboard bento cards ----------
{
  const r = await req("/admin");
  check("dashboard 200", r.status === 200);
  check("bento: میانگین زمان مطالعه present", r.text.includes("میانگین زمان مطالعه"));
  check("bento: شمار نوشته‌ها present", r.text.includes("شمار نوشته‌ها"));
  check("bento: آخرین خواننده present", r.text.includes("آخرین خواننده"));
  check("bento: آخرین نوشته present", r.text.includes("آخرین نوشته"));
}

// ---------- 7. composer copy sweep ----------
{
  const r = await req("/admin/texts/new");
  check("composer page 200", r.status === 200);
  check("composer: عنوان نوشته placeholder", r.text.includes("عنوان نوشته"));
  check("composer: انتشار نوشته button", r.text.includes("انتشار نوشته"));
  check("composer: no publish-link box", !r.text.includes("انتشار و ساخت لینک عمومی"));
  check("no more فصل جدید", !r.text.includes("فصل جدید"));
}

// ---------- 8. cleanup ----------
{
  const r = await req(`/api/texts/${textId}`, { method: "DELETE", expect: 200 });
  check("cleanup: text deleted", r.status === 200);
}

console.log(failures === 0 ? "\nALL COMPOSER CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
