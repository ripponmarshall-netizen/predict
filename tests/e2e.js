/* tests/e2e.js — Predikt in a real browser (Chromium via Playwright), at
   iPhone size: on-phone mode end to end, then online mode with several
   players against tests/fake-supabase.js (real supabase-js, real schema,
   real row-level security). The CDN scripts are served from node_modules,
   checked against the same integrity hashes as index.html.
   Needs a Postgres server (PGHOST, PGUSER, PGPASSWORD). Run: npm run e2e
   Set SHOTS=some/folder to save screenshots; CHROMIUM_PATH to use a
   Chromium already on the machine. */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Pool } = require("pg");
const { chromium } = require("playwright");
const { startFakeSupabase, CODE } = require("./fake-supabase");

const ROOT = path.join(__dirname, "..");
const APP_PORT = 8791;
const SB_PORT = 54329;
const DB = "predikt_e2e";
const SHOTS = process.env.SHOTS;
const CDN = {
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js":
    "node_modules/react/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js":
    "node_modules/react-dom/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js":
    "node_modules/@babel/standalone/babel.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js":
    "node_modules/@supabase/supabase-js/dist/umd/supabase.js",
};
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".jsx": "text/babel",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

let failures = 0;
const check = (ok, msg) => {
  if (ok) console.log(`  ok  ${msg}`);
  else {
    failures++;
    console.error(`FAIL ${msg}`);
  }
};

function serveApp() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.join(ROOT, p === "/" ? "index.html" : p);
      if (
        !file.startsWith(ROOT) ||
        !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(APP_PORT, () => resolve(server));
  });
}

async function freshDatabase() {
  const admin = new Pool({ database: "postgres" });
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.query(`create database ${DB}`);
  await admin.end();
  const pool = new Pool({ database: DB });
  await pool.query(
    fs.readFileSync(path.join(ROOT, "supabase/bootstrap.sql"), "utf8"),
  );
  await pool.query(
    fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8"),
  );
  return pool;
}

/* A phone-sized browser context. config: what config.js says (null: run on
   the phone only). */
async function phone(browser, { config, scheme = "dark" }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    serviceWorkers: "block",
    colorScheme: scheme,
  });
  await ctx.route(/^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net)\//, (r) => {
    const f = CDN[r.request().url()];
    return f
      ? r.fulfill({
          body: fs.readFileSync(path.join(ROOT, f)),
          contentType: "application/javascript",
          headers: { "access-control-allow-origin": "*" },
        })
      : r.abort();
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(/\/config\.js$/, (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `window.PREDIKT_CONFIG = ${JSON.stringify(config || { supabaseUrl: "", supabaseKey: "" })};`,
    }),
  );
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  // Expected 4xx answers (a wrong code, a taken handle) log a "Failed to
  // load resource" line; anything else logged as an error is a bug.
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
      page.errors.push(m.text());
  });
  return page;
}

const toast = async (page, text) => {
  try {
    await page
      .locator(".pk-toast", { hasText: text })
      .first()
      .waitFor({ timeout: 6000 });
    return true;
  } catch {
    return false;
  }
};
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
const closeSheet = async (page) => {
  await page.locator(".pk-sheet button[aria-label=Close]").click();
  await page.locator(".pk-sheet").waitFor({ state: "detached" });
};
const tab = (page, name) =>
  page.locator(`nav button:has-text('${name}')`).click();

/* ---------- on the phone ---------- */

async function localMode(browser) {
  console.log("On the phone");
  const page = await phone(browser, { config: null });
  await page.goto(`http://localhost:${APP_PORT}/`);
  await page
    .getByText("Make your call before it closes")
    .waitFor({ timeout: 30000 });
  await shot(page, "local-01-questions");
  await page.click("button:has-text('Got it')");

  await page.click("text=Will the Bank of Jamaica hold");
  await page.click(".pk-sheet button:has-text('75%')");
  await shot(page, "local-02-call");
  await page.click(".pk-sheet button:has-text('Save your call')");
  check(await toast(page, "Call saved"), "a Yes/No call saves");
  check(
    await page.locator(".pk-sheet").getByText("75% Yes").first().isVisible(),
    "the sheet shows your call",
  );
  check(
    await page.locator(".pk-sheet").getByText("Crowd · 5 calls").isVisible(),
    "the crowd shows once you've called",
  );
  await closeSheet(page);

  await page.click("text=Which school wins Boys' Champs 2027?");
  await page.click(".pk-sheet [role=radio]:has-text('Calabar')");
  await page.locator(".pk-sheet input[aria-label='How sure']").fill("55");
  await page.click(".pk-sheet button:has-text('Save your call')");
  check(await toast(page, "Call saved"), "an options call saves");
  check(
    await page
      .locator(".pk-sheet")
      .getByText("55% Calabar")
      .first()
      .isVisible(),
    "pick and confidence make the call",
  );
  await closeSheet(page);

  await tab(page, "Admin");
  await page.click("text=Will the pole-sitter win");
  await page.click(".pk-sheet [role=radiogroup] button:has-text('Yes')");
  await page.click(".pk-sheet button:has-text('Resolve')");
  await page.click("[role=alertdialog] button:has-text('Resolve')");
  check(await toast(page, "Resolved and scored"), "resolving scores the calls");
  check(
    await page.locator(".pk-sheet").getByText("Result: Yes").isVisible(),
    "the result shows",
  );
  await shot(page, "local-03-resolved");
  await closeSheet(page);

  await tab(page, "Leaders");
  await page.getByText("Share top 10 to WhatsApp").waitFor();
  const board = await page.locator("main").innerText();
  check(
    /mobay_mike[\s\S]*99/.test(board),
    "90% on the right side tops the board with 99",
  );
  check(
    !/−|-\d/.test(board.replace(/\d+-\d+/g, "")),
    "no negative points anywhere",
  );
  check(
    (await page.locator(".pk-medal").count()) >= 3,
    "the top three get medals",
  );
  await shot(page, "local-04-leaders");
  await page.click("button[role=radio]:has-text('Accuracy')");
  check(
    await page.getByText(`Nobody has 3 scored calls here yet.`).isVisible(),
    "accuracy needs three scored calls",
  );
  await page.click("button[role=radio]:has-text('Points')");

  await tab(page, "Me");
  await page.click("main button:has-text('Edit')");
  await page.fill("#pf-handle", "portie_rippon");
  await page.selectOption("#pf-parish", "Portland");
  await page.click("[role=dialog] button:has-text('Save')");
  check(
    await toast(page, "Welcome to the league"),
    "the first profile saves, with a welcome",
  );
  await shot(page, "local-05-me");

  await tab(page, "Admin");
  await page.click("text=Write a question");
  await page.click("[role=dialog] button:has-text('Publish question')");
  check(
    await page
      .locator("[role=alert]")
      .getByText("Tick every box in the checklist.")
      .isVisible(),
    "the checklist must be ticked",
  );
  await page.fill(
    "#nq-title",
    "Will Usain Bolt's 100m record still stand at the end of 2027?",
  );
  await page.fill("#nq-src", "World Athletics records");
  for (const t of [
    "Clear wording",
    "Source named",
    "Closes before the event",
    "Passes the hard rules",
  ])
    await page.click(`[role=checkbox]:has-text('${t}')`);
  await shot(page, "local-06-new-question");
  await page.click("[role=dialog] button:has-text('Publish question')");
  check(await toast(page, "Question published"), "a new question publishes");

  // Close a question now: it must show as closed at once, not after the
  // clock's next tick.
  await tab(page, "Questions");
  await page.click("text=Will Usain Bolt's 100m record");
  await page.click(".pk-sheet button:has-text('Admin')");
  await page.click(".pk-sheet button:has-text('Close now')");
  check(await toast(page, "Closed"), "close now works");
  check(
    await page
      .locator(".pk-sheet")
      .getByText("Closed: awaiting the result")
      .isVisible(),
    "a closed question shows as closed straight away",
  );
  await closeSheet(page);

  await tab(page, "Me");
  await page.click("button[role=radio]:has-text('Light')");
  await tab(page, "Questions");
  await shot(page, "local-07-light");

  await page.reload();
  await page
    .getByText("Make your call before it closes")
    .waitFor({ timeout: 30000 });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("predikt:v1")),
  );
  check(
    saved.theme === "light" &&
      saved.players.find((p) => p.id === "me").handle === "portie_rippon" &&
      saved.questions.length === 8,
    "everything survives a reload",
  );
  check(
    page.errors.length === 0,
    `no errors in the page${page.errors.length ? `: ${page.errors.join(" | ")}` : ""}`,
  );
  await page.context().close();
}

/* ---------- online ---------- */

async function signIn(page, email, handle, { wrongFirst = false } = {}) {
  await page.fill("#si-email", email);
  await page.click("[role=dialog] button:has-text('Email me a code')");
  await page.locator("#si-code").waitFor();
  if (wrongFirst) {
    await page.fill("#si-code", "000000");
    await page.click("[aria-label='Sign in'] button:has-text('Sign in')");
    check(
      await toast(page, "That code is wrong"),
      "a wrong code is refused, with a clear message",
    );
  }
  await page.fill("#si-code", CODE);
  await page.click("[aria-label='Sign in'] button:has-text('Sign in')");
  check(
    await toast(page, "Signed in"),
    `${email} signs in with the emailed code`,
  );
  await page.getByText("Set up your profile").waitFor({ timeout: 8000 });
  check(true, "a new player is asked for a handle straight away");
  if (handle) {
    await page.fill("#pf-handle", handle);
    await page.selectOption("#pf-parish", "Portland");
    await page.click("[role=dialog] button:has-text('Save')");
    check(
      await toast(page, "Welcome to the league"),
      `${handle}'s profile is made`,
    );
  }
}

async function onlineMode(browser, pool, sb) {
  console.log("Online");
  const config = { supabaseUrl: sb.url, supabaseKey: "sb_publishable_e2e" };

  // Signed out: anyone can look.
  const guest = await phone(browser, { config });
  await guest.goto(`http://localhost:${APP_PORT}/`);
  await guest.getByText("Sign in to play").first().waitFor({ timeout: 30000 });
  await guest.getByText("No open questions here yet.").waitFor();
  check(true, "signed out: the questions load, with a sign-in prompt");
  await shot(guest, "online-01-signed-out");

  // The admin signs up, and is made admin by hand (as the README says).
  const admin = await phone(browser, { config });
  await admin.goto(`http://localhost:${APP_PORT}/`);
  await tab(admin, "Me");
  await admin.click("main button:has-text('Sign in')");
  await shot(admin, "online-02-sign-in");
  await signIn(admin, "rippon@example.com", "rippon", { wrongFirst: true });
  check(
    sb.sent.includes("rippon@example.com"),
    "the code was sent to that email",
  );
  await pool.query(
    "update profiles set is_admin = true where handle = 'rippon'",
  );
  await admin.reload();
  await admin
    .locator("nav button:has-text('Admin')")
    .waitFor({ timeout: 15000 });
  check(true, "an admin gets the Admin tab");

  await tab(admin, "Admin");
  await admin.click("text=Write a question");
  await admin.fill(
    "#nq-title",
    "Will the BOJ hold the policy rate in November?",
  );
  await admin.fill("#nq-src", "BOJ press release");
  await admin.fill("[aria-label='Source link']", "https://boj.org.jm");
  for (const t of [
    "Clear wording",
    "Source named",
    "Closes before the event",
    "Passes the hard rules",
  ])
    await admin.click(`[role=checkbox]:has-text('${t}')`);
  await admin.click("[role=dialog] button:has-text('Publish question')");
  check(
    await toast(admin, "Question published"),
    "the admin publishes a question online",
  );

  // A second player: the handle "rippon" is taken.
  const kat = await phone(browser, { config, scheme: "light" });
  await kat.goto(`http://localhost:${APP_PORT}/`);
  await kat
    .getByText("Will the BOJ hold the policy rate in November?")
    .waitFor({ timeout: 30000 });
  await kat.click("button:has-text('Sign in')");
  await signIn(kat, "kat@example.com", null);
  // Checked as you type against the players already loaded (the database
  // enforces it too: supabase/test.sql).
  await kat.fill("#pf-handle", "RIPPON");
  check(
    await kat
      .locator("[role=dialog]")
      .getByText("That handle is taken.")
      .isVisible(),
    "a taken handle is refused, ignoring case",
  );
  check(
    await kat.locator("[role=dialog] button:has-text('Save')").isDisabled(),
    "and can't be saved",
  );
  await kat.fill("#pf-handle", "kat");
  await kat.click("[role=dialog] button:has-text('Save')");
  check(await toast(kat, "Welcome to the league"), "kat's profile is made");

  await kat.click("text=Will the BOJ hold the policy rate in November?");
  await kat.locator(".pk-sheet input[aria-label='Chance of Yes']").fill("30");
  await kat.click(".pk-sheet button:has-text('Save your call')");
  check(await toast(kat, "Call saved"), "kat's call saves online");
  check(
    await kat.locator(".pk-sheet").getByText("Crowd · 1 call").isVisible(),
    "the crowd comes from the server",
  );
  await shot(kat, "online-03-call");
  await closeSheet(kat);
  check(
    (await pool.query("select count(*)::int as n from forecasts")).rows[0].n ===
      1,
    "the call is in the database",
  );

  // The admin calls too, then closes and resolves.
  await admin.click("header button[aria-label='Refresh']");
  await tab(admin, "Questions");
  await admin.click("text=Will the BOJ hold the policy rate in November?");
  await admin.click(".pk-sheet button:has-text('90%')");
  await admin.click(".pk-sheet button:has-text('Save your call')");
  check(await toast(admin, "Call saved"), "the admin's call saves");
  check(
    await admin.locator(".pk-sheet").getByText("Crowd · 2 calls").isVisible(),
    "the crowd counts both players",
  );
  await admin.click(".pk-sheet button:has-text('Admin')");
  await admin.click(".pk-sheet button:has-text('Close now')");
  check(await toast(admin, "Closed"), "the admin closes it online");
  await admin.click(".pk-sheet [role=radiogroup] button:has-text('Yes')");
  await admin.click(".pk-sheet button:has-text('Resolve')");
  await admin.click("[role=alertdialog] button:has-text('Resolve')");
  check(
    await toast(admin, "Resolved and scored"),
    "the admin resolves it online",
  );
  check(
    await admin.locator(".pk-sheet").getByText("Result: Yes").isVisible(),
    "the result shows online",
  );
  await shot(admin, "online-04-resolved");
  await closeSheet(admin);
  const scores = (
    await pool.query(
      "select p.handle, round(s.points) as pts from scores s join profiles p on p.id = s.user_id order by pts desc",
    )
  ).rows;
  check(
    scores.map((r) => `${r.handle}:${r.pts}`).join(",") === "rippon:99,kat:51",
    "the database scored both calls (99 and 51)",
  );

  await tab(admin, "Leaders");
  await admin.getByText("Share top 10 to WhatsApp").waitFor({ timeout: 8000 });
  const board = await admin.locator("main").innerText();
  check(
    /rippon[\s\S]*99[\s\S]*kat[\s\S]*51/.test(board),
    "the online leaderboard ranks rippon then kat",
  );
  await shot(admin, "online-05-leaders");

  await kat.click("header button[aria-label='Refresh']");
  await kat.locator("text=Results").first().waitFor({ timeout: 8000 });
  await kat.click("text=Will the BOJ hold the policy rate in November?");
  await kat.locator(".pk-sheet").getByText("Result: Yes").waitFor();
  await kat.waitForTimeout(900);
  check(
    /51\s*points/.test(await kat.locator(".pk-sheet").innerText()),
    "kat sees her 51 points",
  );
  await closeSheet(kat);

  // Signed out, saving a call asks you to sign in.
  await guest.reload();
  await guest.getByText("Results").waitFor({ timeout: 30000 });
  await tab(guest, "Leaders");
  check(
    /rippon[\s\S]*kat/.test(await guest.locator("main").innerText()),
    "signed out, the leaderboard is public",
  );

  // A dispute holds the points back.
  await tab(admin, "Questions");
  await admin.click("text=Will the BOJ hold the policy rate in November?");
  await admin.click(".pk-sheet button:has-text('Admin')");
  await admin.fill(".pk-sheet textarea", "Wrong press release");
  await admin.click(".pk-sheet button:has-text('Mark disputed')");
  check(await toast(admin, "Marked disputed"), "the admin marks it disputed");
  check(
    (await pool.query("select count(*)::int as n from scores")).rows[0].n === 0,
    "a dispute holds every point",
  );
  await closeSheet(admin);

  // Signing out.
  await tab(kat, "Me");
  await kat.click("main button:has-text('Sign out')");
  check(await toast(kat, "Signed out"), "kat signs out");
  await kat.getByText("Sign in to play").first().waitFor();
  check(true, "signed out, Me offers sign-in again");

  for (const p of [guest, admin, kat]) {
    check(
      p.errors.length === 0,
      `no errors in the page${p.errors.length ? `: ${p.errors.join(" | ")}` : ""}`,
    );
    await p.context().close();
  }
}

(async () => {
  const appServer = await serveApp();
  const pool = await freshDatabase();
  const sb = await startFakeSupabase({ port: SB_PORT, pool });
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  );
  try {
    await localMode(browser);
    await onlineMode(browser, pool, sb);
  } catch (e) {
    failures++;
    console.error("FAIL", e);
  } finally {
    await browser.close();
    sb.server.close();
    appServer.close();
    await pool.end();
  }
  if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("All end-to-end checks passed");
})();
