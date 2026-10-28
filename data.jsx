/* data.jsx — where the data lives: on this phone (the state changes in
   helpers.jsx, saved in localStorage) or online in Supabase (supabase-js v2
   against supabase/schema.sql). Both hand the screens the same `api` and
   the same state shape, so the screens don't care which. */
/* Pure JS, no JSX — kept Node-loadable so predikt.test.js can test the
   online mapping. */

// In Node (tests) pull in helpers.jsx; in the browser it's already loaded.
if (typeof window === "undefined" && typeof require === "function") Object.assign(globalThis, require("./helpers.jsx"));

const MODE_KEY = "predikt:mode";
const ONLINE_CACHE = "predikt:online";

/* ---------- which mode ---------- */

/* The Supabase project from config.js, or null to run on this phone only. */
function onlineConfig() {
  const c = (typeof window !== "undefined" && window.PREDIKT_CONFIG) || {};
  return c.supabaseUrl && c.supabaseKey ? c : null;
}
/* "online" when config.js names a project and supabase-js loaded, unless
   this phone chose to stay on its own data; "local" otherwise. */
function dataMode() {
  if (!onlineConfig() || typeof window === "undefined" || !window.supabase) return "local";
  let m = null;
  try { m = localStorage.getItem(MODE_KEY); } catch {}
  return m === "local" ? "local" : "online";
}
function setDataMode(m) {
  try { localStorage.setItem(MODE_KEY, m); } catch {}
}

/* ---------- errors ---------- */

/* A message a player can act on, from a supabase-js, Postgres or network
   error. Messages the database raises itself ("This question has closed.")
   already read well and pass straight through. */
function friendlyError(e) {
  const msg = String((e && (e.message || e.msg || e.error_description)) || e || "");
  const code = e && e.code;
  if (code === "23505") return /handle/.test(msg) ? "That handle is taken." : "That already exists.";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "You're not allowed to do that. Are you signed in?";
  if (code === "23514") return "That doesn't fit the rules for this field.";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return "Couldn't reach Predikt. Check your connection and try again.";
  if ((e && e.status === 429) || /rate limit|too many|for security purposes/i.test(msg)) return "Too many tries. Wait a minute, then try again.";
  if (/sending.*email|email.*send/i.test(msg)) return "Couldn't send the email just now. Try again in a minute.";
  if (/expired|invalid.*(otp|token)|(otp|token).*invalid/i.test(msg)) return "That code is wrong or has expired. Ask for a new one.";
  if (/jwt|session/i.test(msg)) return "Your sign-in has expired. Sign in again.";
  return msg || "Something went wrong.";
}

/* ---------- online: reading ---------- */

/* Read every row, a page at a time: the API returns at most 1,000 rows per
   request. `make` builds a fresh, ordered query each time. */
async function fetchAll(make) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await make().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) return out;
  }
}
const must = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

/* Everything the screens need. Signed out: the public tables. Signed in:
   also your profile, your calls and your scores. Other players' calls
   aren't needed: their totals come from the leaderboard view and the
   crowd from crowds(). */
async function loadRemote(client, uid) {
  const [questions, board, profile, myScores, myForecasts, log, crowds] = await Promise.all([
    fetchAll(() => client.from("questions").select("*").order("close_at").order("id")),
    fetchAll(() => client.from("leaderboard").select("*").order("id")),
    uid ? must(client.from("profiles").select("*").eq("id", uid)).then((r) => r[0] || null) : null,
    uid ? fetchAll(() => client.from("scores").select("question_id, points, brier").eq("user_id", uid).order("question_id")) : [],
    uid ? fetchAll(() => client.from("forecasts").select("id, question_id, probs, created_at").eq("user_id", uid).order("id")) : [],
    must(client.from("resolution_log").select("*").order("id", { ascending: false }).limit(200)),
    must(client.rpc("crowds")),
  ]);
  return { questions, board, profile, myScores, myForecasts, log, crowds };
}

/* Postgres times carry microseconds ("…:06.123456+00:00"); trim them to
   milliseconds, the precision every browser's date parser is sure to
   accept (some Safari versions reject more digits). */
function ts(t) {
  return t ? String(t).replace(/(\.\d{3})\d+/, "$1") : t;
}

/* Database rows → the app's state shape (the same one helpers.jsx works
   on). Your own user id becomes ME, so every screen finds you the same way
   online and on the phone. */
function fromRemote(raw, uid) {
  const idOf = (u) => (uid && u === uid ? ME : u);
  const questions = (raw.questions || []).map((q) => ({
    id: q.id, title: q.title, kind: q.kind, options: q.options, category: q.category, region: q.region,
    closeAt: ts(q.close_at), sourceName: q.resolution_source, sourceUrl: isUrl(q.resolution_url) ? q.resolution_url : "",
    status: q.status, outcome: q.outcome, resolvedAt: ts(q.resolved_at), createdAt: ts(q.created_at),
  }));
  const players = (raw.board || []).map((r) => ({ id: idOf(r.id), handle: r.handle, parish: r.parish || "", country: r.country || "Jamaica" }));
  const p = raw.profile;
  if (!players.some((x) => x.id === ME)) {
    players.push({ id: ME, handle: p ? p.handle : "you", parish: (p && p.parish) || "", country: (p && p.country) || "Jamaica" });
  }
  const forecasts = (raw.myForecasts || []).map((f) => ({
    id: String(f.id), playerId: ME, questionId: f.question_id, probs: f.probs.map(Number), createdAt: ts(f.created_at),
  }));
  const log = (raw.log || []).map((l) => ({
    id: String(l.id), questionId: l.question_id, action: l.action, outcome: l.outcome || "",
    sourceUrl: isUrl(l.source_url) ? l.source_url : "", note: l.note || "", at: ts(l.at),
  }));
  return {
    questions, players, forecasts, log,
    signedOut: !uid,
    needsProfile: !!uid && !p,
    isAdmin: !!(p && p.is_admin),
  };
}

/* The server's scores in the shape scoreAll() gives on the phone. Totals
   come from the leaderboard view; per-question points only for you. */
function remoteScores(state, raw, uid) {
  const idOf = (u) => (uid && u === uid ? ME : u);
  const byPlayer = new Map();
  for (const r of raw.board || []) {
    const scored = Number(r.scored) || 0;
    if (scored) byPlayer.set(idOf(r.id), { points: Number(r.points) || 0, scored, brierSum: Number(r.avg_brier) * scored });
  }
  const byQuestion = new Map();
  for (const s of raw.myScores || []) {
    byQuestion.set(s.question_id, new Map([[ME, { points: Number(s.points), brier: Number(s.brier) }]]));
  }
  const crowds = new Map((raw.crowds || []).map((c) => [c.question_id, { count: Number(c.calls) || 0, probs: c.probs ? c.probs.map(Number) : null }]));
  return { byPlayer, byQuestion, latest: latestForecasts(state.forecasts, state.questions), crowds };
}

/* The last data seen online, so the app opens straight away (and still
   shows something offline) while it fetches fresh data. */
function readOnlineCache() {
  try {
    const c = JSON.parse(localStorage.getItem(ONLINE_CACHE) || "null");
    return c && c.raw ? c : null;
  } catch { return null; }
}
function writeOnlineCache(uid, raw) {
  try { localStorage.setItem(ONLINE_CACHE, JSON.stringify({ uid: uid || null, raw })); } catch {}
}

/* ---------- the api the screens call ---------- */

/* On the phone: the helpers.jsx state changes. Each throws a message the
   screens show; nothing waits on the network. */
function localApi(getState, commit) {
  const apply = (fn) => commit(fn(getState()));
  const t = () => Date.now();
  return {
    online: false,
    forecast: (questionId, probs) => apply((s) => addForecast(s, { playerId: ME, questionId, probs }, t())),
    recordFor: (playerId, questionId, probs) => apply((s) => addForecast(s, { playerId, questionId, probs, by: "admin" }, t())),
    createQuestion: (d) => apply((s) => createQuestion(s, d, t())),
    close: (id) => apply((s) => closeQuestion(s, id, t())),
    resolve: (id, outcome, meta) => apply((s) => resolveQuestion(s, id, outcome, meta, t())),
    dispute: (id, note) => apply((s) => disputeQuestion(s, id, note, t())),
    void: (id, meta) => apply((s) => voidQuestion(s, id, meta, t())),
    remove: (id) => apply((s) => deleteQuestion(s, id)),
    saveProfile: (patch) => apply((s) => updateProfile(s, ME, patch)),
    addPlayer: (p) => apply((s) => addPlayer(s, p)),
    removePlayer: (id) => apply((s) => removePlayer(s, id)),
  };
}

/* Online: inserts and database functions, then a fresh read. The same
   checks run here first, so a mistake gets the same message without a
   round trip; the database enforces them regardless. Only what a signed-in
   player may do exists here: no deleting questions, no calls on someone
   else's behalf. */
function remoteApi(client, ctx) {
  // The change is saved once the query succeeds; a failed refresh after it
  // shows as the header's sync warning, not as a failed action.
  const refresh = () => ctx.reload().catch(() => {});
  const after = async (query) => {
    await must(query);
    await refresh();
  };
  const needUser = () => {
    if (!ctx.uid()) throw new Error("Sign in first.");
  };
  return {
    online: true,
    forecast: (questionId, probs) => {
      needUser();
      return after(client.from("forecasts").insert({ question_id: questionId, probs }));
    },
    createQuestion: (d) => {
      const problems = questionProblems(d, Date.now());
      if (problems.length) throw new Error(problems[0]);
      return after(client.from("questions").insert({
        title: d.title.trim(),
        kind: d.kind,
        options: d.kind === "binary" ? ["Yes", "No"] : d.options.map((o) => String(o).trim()).filter(Boolean),
        category: d.category,
        region: d.region,
        close_at: fromJmInput(d.closeLocal),
        resolution_source: d.sourceName.trim(),
        resolution_url: (d.sourceUrl || "").trim() || null,
      }));
    },
    close: (id) => after(client.rpc("close_question", { q_id: id })),
    resolve: (id, outcome, { sourceUrl, note }) => {
      if (!isUrl(sourceUrl)) throw new Error("Add a link to the source (http:// or https://).");
      return after(client.rpc("resolve_question", { q_id: id, outcome_index: outcome, source_url: sourceUrl.trim(), note: (note || "").trim() || null }));
    },
    dispute: (id, note) => {
      if (!String(note || "").trim()) throw new Error("Say what's disputed.");
      return after(client.rpc("dispute_question", { q_id: id, note: note.trim() }));
    },
    void: (id, { sourceUrl, note }) => {
      if (!String(note || "").trim()) throw new Error("Say why it's void.");
      if (sourceUrl && !isUrl(sourceUrl)) throw new Error("The link must start with http:// or https://.");
      return after(client.rpc("void_question", { q_id: id, note: note.trim(), source_url: (sourceUrl || "").trim() || null }));
    },
    /* Your profile: made the first time, edited after. Not an upsert: that
       would also try to write the id, which players can't update. */
    saveProfile: async ({ handle, parish, country }) => {
      needUser();
      const h = String(handle || "").trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(h)) throw new Error("Handles are 3–20 letters, numbers or _.");
      const row = { handle: h, parish: parish || null, country: country || "Jamaica" };
      if (ctx.hasProfile()) await must(client.from("profiles").update(row).eq("id", ctx.uid()));
      else await must(client.from("profiles").insert({ id: ctx.uid(), ...row }));
      await refresh();
    },
    /* Sign in with a one-time code by email (a link in the same email
       works too). The code is typed in the app, which matters on an
       iPhone: a Home Screen app doesn't share Safari's sign-in. */
    signIn: (email) => must(client.auth.signInWithOtp({
      email: String(email || "").trim(),
      options: { shouldCreateUser: true, emailRedirectTo: ctx.redirectTo() },
    })),
    verify: (email, code) => must(client.auth.verifyOtp({ email: String(email || "").trim(), token: String(code || "").trim(), type: "email" })),
    signOut: () => must(client.auth.signOut()),
  };
}

const _dataExports = {
  MODE_KEY, ONLINE_CACHE, ts,
  onlineConfig, dataMode, setDataMode, friendlyError,
  fetchAll, loadRemote, fromRemote, remoteScores, readOnlineCache, writeOnlineCache,
  localApi, remoteApi,
};

if (typeof window !== "undefined") Object.assign(window, _dataExports);
if (typeof module !== "undefined" && module.exports) module.exports = _dataExports;
