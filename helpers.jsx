/* helpers.jsx — constants, Jamaica time, scoring, state changes, storage */
/* Pure JS, no JSX — kept Node-loadable so predikt.test.js can require() it. */

const APP_NAME = "Predikt";
const APP_VERSION = "0.2";
const CONTACT_EMAIL = "ripponmarshall@yahoo.com";
const STORAGE = "predikt:v1";
const ME = "me";

/* Jamaica keeps UTC−5 all year (no daylight saving), so a time typed in
   Jamaica time converts with a fixed offset. Times are stored in UTC. */
const JM_TZ = "America/Jamaica";
const JM_OFFSET = "-05:00";

/* Region tags drive the Jamaica / International toggle. Adding a region
   (e.g. Caribbean) is a line here, not a rebuild. */
const REGIONS = [
  { v: "JM", l: "Jamaica", color: "var(--jm)", icon: "pin" },
  { v: "INTL", l: "International", color: "var(--intl)", icon: "globe" },
];
const CATEGORIES = ["Sport", "Politics", "Economy", "Culture", "Markets", "Other"];
const KINDS = [
  { v: "binary", l: "Yes / No" },
  { v: "choice", l: "Options" },
  { v: "range", l: "Number range" },
];
const MAX_OPTIONS = 8;
/* Accuracy rankings need a few scored calls: one lucky call isn't a record. */
const MIN_FOR_ACCURACY = 3;

const PARISHES = [
  "Kingston", "St Andrew", "St Thomas", "Portland", "St Mary", "St Ann", "Trelawny",
  "St James", "Hanover", "Westmoreland", "St Elizabeth", "Manchester", "Clarendon", "St Catherine",
];
const COUNTRIES = ["Jamaica", "United Kingdom", "United States", "Canada", "Caribbean (other)", "Other"];

/* SOP: new question. Every box is ticked before a question can be saved. */
const NEW_QUESTION_CHECKS = [
  { k: "clear", l: "Clear wording", d: "One reading only: yes/no, an option or a number. No ambiguity." },
  { k: "source", l: "Source named", d: "The resolution source and time are named, e.g. the BOJ press release." },
  { k: "close", l: "Closes before the event", d: "The close time (Jamaica time) is before the event starts." },
  { k: "rules", l: "Passes the hard rules", d: "No deaths, no crimes against named people, no minors' personal outcomes." },
];
/* Words that suggest a question may break the hard rules. A prompt to
   check, not a block: "Boys' Champs" is fine, a named 16-year-old isn't. */
const RULE_WORDS = /\b(die|dies|died|death|dead|murder\w*|kill\w*|shot|shooting|stab\w*|crime|arrest\w*|charged|jail\w*|prison|minor|child|children|boy|girl)\b/gi;

/* ---------- small utils ---------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function regionOf(v) {
  return REGIONS.find((r) => r.v === v) || REGIONS[0];
}
function sum(xs) {
  return xs.reduce((s, x) => s + x, 0);
}
/* Round half away from zero (Math.round sends −2.5 to −2). */
function roundAway(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}
/* Points as a whole number, with thousands separators ("1,250"). */
function fmtPts(x) {
  return roundAway(x || 0).toLocaleString("en-GB");
}
function fmtBrier(x) {
  return x == null || !isFinite(x) ? "—" : x.toFixed(3);
}

/* ---------- Jamaica time ---------- */

const jmParts = (iso) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: JM_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const o = {};
  parts.forEach((p) => { o[p.type] = p.value; });
  return o;
};
/* "Thu 5 Nov, 7:00 pm" in Jamaica time. */
function fmtWhen(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: JM_TZ, weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}
/* A <input type="datetime-local"> value, in Jamaica time. */
function toJmInput(iso) {
  const p = jmParts(iso);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/* A datetime-local value typed in Jamaica time, as a UTC ISO string. */
function fromJmInput(v) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || "")) return null;
  const d = new Date(`${v}:00${JM_OFFSET}`);
  return isNaN(d) ? null : d.toISOString();
}
/* "in 3 days", "in 5 h", "in 40 min". */
function fmtIn(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `in ${h} h`;
  return `in ${Math.round(h / 24)} days`;
}

/* ---------- questions ---------- */

function isClosed(q, now) {
  return Date.parse(q.closeAt) <= now;
}
/* What a question is doing now: open (taking forecasts), closed (waiting
   for a result), resolved, void or disputed (frozen, points on hold). */
function phase(q, now) {
  if (q.status === "resolved" || q.status === "void" || q.status === "disputed") return q.status;
  return isClosed(q, now) ? "closed" : "open";
}
function phaseLabel(q, now) {
  const ph = phase(q, now);
  if (ph === "open") return `Closes ${fmtIn(Date.parse(q.closeAt) - now)}`;
  if (ph === "closed") return "Closed · awaiting result";
  if (ph === "resolved") return `Result: ${q.options[q.outcome]}`;
  if (ph === "void") return "Void · no points";
  return "Disputed · points on hold";
}
function ruleFlags(text) {
  const m = String(text || "").match(RULE_WORDS);
  return m ? [...new Set(m.map((w) => w.toLowerCase()))] : [];
}
function isUrl(s) {
  return /^https?:\/\/\S+\.\S+/.test(String(s || "").trim());
}

/* Check a new-question draft. Returns a list of problems (empty: OK). */
function questionProblems(d, now) {
  const out = [];
  const title = String(d.title || "").trim();
  if (title.length < 10) out.push("Write the question (at least 10 characters).");
  else if (!title.endsWith("?")) out.push("End the question with a question mark.");
  if (title.length > 160) out.push("Keep the question under 160 characters.");
  if (!KINDS.some((k) => k.v === d.kind)) out.push("Pick a question type.");
  if (d.kind !== "binary") {
    const opts = (d.options || []).map((o) => String(o).trim()).filter(Boolean);
    if (opts.length < 2) out.push("Add at least two options.");
    if (opts.length > MAX_OPTIONS) out.push(`Use at most ${MAX_OPTIONS} options.`);
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) out.push("Each option must be different.");
  }
  if (!CATEGORIES.includes(d.category)) out.push("Pick a category.");
  if (!REGIONS.some((r) => r.v === d.region)) out.push("Pick a region.");
  const close = fromJmInput(d.closeLocal);
  if (!close) out.push("Set the close date and time.");
  else if (Date.parse(close) <= now) out.push("The close time must be in the future.");
  if (String(d.sourceName || "").trim().length < 3) out.push("Name the resolution source.");
  if (d.sourceUrl && !isUrl(d.sourceUrl)) out.push("The source link must start with http:// or https://.");
  if (!NEW_QUESTION_CHECKS.every((c) => d.checks?.[c.k])) out.push("Tick every box in the checklist.");
  return out;
}

/* ---------- forecasts ---------- */

/* Forecasts are whole percentages, one per option, adding up to 100.
   Yes/No is [yes, no]. */
function validProbs(probs, n) {
  return Array.isArray(probs) && probs.length === n &&
    probs.every((p) => Number.isInteger(p) && p >= 0 && p <= 100) && sum(probs) === 100;
}
function binaryProbs(yes) {
  const y = Math.max(0, Math.min(100, Math.round(yes)));
  return [y, 100 - y];
}
/* The lowest confidence a pick can have: an even spread across n options. */
function minConfidence(n) {
  return Math.ceil(100 / n);
}
/* Pick one option and say how sure you are; the rest share what's left
   evenly (any remainder goes to the first of them). One tap and one slider
   on a phone, and still a full forecast for the scoring. */
function pickProbs(n, pick, confidence) {
  const c = Math.max(minConfidence(n), Math.min(100, Math.round(confidence)));
  const rest = 100 - c;
  const base = Math.floor(rest / (n - 1));
  let extra = rest - base * (n - 1);
  return Array.from({ length: n }, (_, i) => {
    if (i === pick) return c;
    const p = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    return p;
  });
}
/* The other way round: which option a forecast picks, and how sure. */
function pickOf(probs) {
  let pick = 0;
  probs.forEach((p, i) => { if (p > probs[pick]) pick = i; });
  return { pick, confidence: probs[pick] };
}
function fmtForecast(q, probs) {
  if (!probs) return "";
  if (q.kind === "binary") return `${probs[0]}% Yes`;
  const { pick, confidence } = pickOf(probs);
  return `${confidence}% ${q.options[pick]}`;
}

/* The forecast that counts: a player's latest before the question closes. */
function countingForecast(forecasts, playerId, q) {
  const close = Date.parse(q.closeAt);
  let best = null;
  for (const f of forecasts) {
    if (f.playerId !== playerId || f.questionId !== q.id) continue;
    const t = Date.parse(f.createdAt);
    if (t >= close) continue;
    if (!best || t >= Date.parse(best.createdAt)) best = f;
  }
  return best;
}
/* Every player's counting forecast on each question, as
   Map(questionId → Map(playerId → forecast)). One pass over the list. */
function latestForecasts(forecasts, questions) {
  const qs = new Map(questions.map((q) => [q.id, q]));
  const out = new Map();
  for (const f of forecasts) {
    const q = qs.get(f.questionId);
    if (!q || Date.parse(f.createdAt) >= Date.parse(q.closeAt)) continue;
    if (!out.has(q.id)) out.set(q.id, new Map());
    const m = out.get(q.id);
    const cur = m.get(f.playerId);
    if (!cur || Date.parse(f.createdAt) >= Date.parse(cur.createdAt)) m.set(f.playerId, f);
  }
  return out;
}
/* The crowd: the average of everyone's counting forecasts. */
function crowdOf(latestForQ, n) {
  const fs = latestForQ ? [...latestForQ.values()] : [];
  if (!fs.length) return { count: 0, probs: null };
  const probs = Array.from({ length: n }, (_, i) => sum(fs.map((f) => f.probs[i])) / fs.length);
  return { count: fs.length, probs };
}

/* ---------- scoring ---------- */

/* Brier score over every option: the sum of (forecast − outcome)², where
   the outcome is 1 for what happened and 0 for the rest. 0 is perfect, 2 is
   certain and wrong. Yes/No is the two-option case. */
function brier(probs, outcome) {
  return sum(probs.map((p, i) => (p / 100 - (i === outcome ? 1 : 0)) ** 2));
}
/* Points: 100 × (1 − Brier ÷ 2), so every call scores from 0 (certain
   and wrong) to 100 (certain and right), never below zero. A straight line
   from the Brier score keeps it honest: your best expected score always
   comes from saying what you really think. (Clamping a signed score at 0
   instead would make going 100% on every call free, since a wrong call
   could cost nothing.) 50% on a Yes/No scores 75 either way.
   supabase/schema.sql scores the same way; keep the two in step. */
function pointsFor(probs, outcome) {
  return 100 * (1 - brier(probs, outcome) / 2);
}
/* What an even spread across n options scores, whatever happens: the
   coin flip to beat (75 on a Yes/No). */
function coinFlipPoints(n) {
  return 100 * (1 - (1 - 1 / n) / 2);
}

/* Scores for every resolved question, and the crowd on every question:
   { byPlayer: Map(playerId → { points, scored, brierSum }),
     byQuestion: Map(questionId → Map(playerId → { points, brier })),
     latest: Map(questionId → Map(playerId → forecast)),
     crowds: Map(questionId → { count, probs }) }
   Online, the same shape is built from the server's scores (data.jsx). */
function scoreAll(state) {
  const latest = latestForecasts(state.forecasts, state.questions);
  const byPlayer = new Map();
  const byQuestion = new Map();
  for (const q of state.questions) {
    if (q.status !== "resolved" || q.outcome == null) continue;
    const m = new Map();
    for (const [pid, f] of latest.get(q.id) || []) {
      const s = { points: pointsFor(f.probs, q.outcome), brier: brier(f.probs, q.outcome) };
      m.set(pid, s);
      const p = byPlayer.get(pid) || { points: 0, scored: 0, brierSum: 0 };
      p.points += s.points;
      p.scored += 1;
      p.brierSum += s.brier;
      byPlayer.set(pid, p);
    }
    byQuestion.set(q.id, m);
  }
  const crowds = new Map(state.questions.map((q) => [q.id, crowdOf(latest.get(q.id), q.options.length)]));
  return { byPlayer, byQuestion, latest, crowds };
}

/* Leagues: everyone, players in Jamaica, the diaspora, or one parish. */
function inLeague(player, league, parish) {
  if (league === "jm") return player.country === "Jamaica";
  if (league === "diaspora") return player.country !== "Jamaica";
  if (league === "parish") return !!parish && player.parish === parish;
  return true;
}
/* Ranked rows for a league, by "points" (total: every call adds, so it
   rewards turning up and being right) or "accuracy" (average points per
   scored call, from MIN_FOR_ACCURACY calls). Ties on the rounded value
   share a rank. Only players with enough scored calls are ranked; the rest
   follow with rank null. Players with no calls at all are left off, except
   you (when signed in). */
function leaderboard(state, scores, league, parish, by = "points") {
  const forecasters = new Set(state.forecasts.map((f) => f.playerId));
  const need = by === "accuracy" ? MIN_FOR_ACCURACY : 1;
  const value = (r) => roundAway(by === "accuracy" ? r.avgPoints : r.points);
  const rows = state.players
    .filter((p) => inLeague(p, league, parish) &&
      (forecasters.has(p.id) || scores.byPlayer.has(p.id) || (p.id === ME && !state.signedOut)))
    .map((p) => {
      const s = scores.byPlayer.get(p.id) || { points: 0, scored: 0, brierSum: 0 };
      return {
        player: p, points: s.points, scored: s.scored,
        avgPoints: s.scored ? s.points / s.scored : null,
        avgBrier: s.scored ? s.brierSum / s.scored : null,
        ranked: s.scored >= need,
      };
    })
    .sort((a, b) =>
      b.ranked - a.ranked ||
      value(b) - value(a) ||
      (a.avgBrier ?? 9) - (b.avgBrier ?? 9) ||
      b.scored - a.scored ||
      a.player.handle.localeCompare(b.player.handle));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (!r.ranked) r.rank = null;
    else r.rank = prev && prev.ranked && value(prev) === value(r) ? prev.rank : i + 1;
  });
  return rows;
}
/* Parish table (Portland vs St Andrew): average points per player who has
   had a question scored, by home parish. */
function parishTable(state, scores) {
  const by = new Map();
  for (const p of state.players) {
    const s = scores.byPlayer.get(p.id);
    if (!p.parish || !s || !s.scored) continue;
    const t = by.get(p.parish) || { parish: p.parish, players: 0, points: 0 };
    t.players += 1;
    t.points += s.points;
    by.set(p.parish, t);
  }
  return [...by.values()]
    .map((t) => ({ ...t, avg: t.points / t.players }))
    .sort((a, b) => b.avg - a.avg || b.players - a.players || a.parish.localeCompare(b.parish));
}

/* ---------- state changes ----------
   Each takes the state and returns a new one, or throws an Error whose
   message can be shown as is. In the Supabase version these become inserts
   and database functions (supabase/schema.sql), with the same rules. */

function findQ(state, id) {
  const q = state.questions.find((x) => x.id === id);
  if (!q) throw new Error("That question no longer exists.");
  return q;
}
const putQ = (state, q) => ({ ...state, questions: state.questions.map((x) => (x.id === q.id ? q : x)) });
const logged = (state, entry, now) => ({
  ...state, log: [{ id: uid(), at: new Date(now).toISOString(), ...entry }, ...state.log],
});

function addForecast(state, { playerId, questionId, probs, by }, now) {
  const q = findQ(state, questionId);
  if (phase(q, now) !== "open") throw new Error("This question has closed.");
  if (!state.players.some((p) => p.id === playerId)) throw new Error("Unknown player.");
  if (!validProbs(probs, q.options.length)) throw new Error("A forecast needs whole percentages adding up to 100.");
  const f = { id: uid(), playerId, questionId, probs: [...probs], createdAt: new Date(now).toISOString() };
  if (by) f.by = by;
  return { ...state, forecasts: [...state.forecasts, f] };
}

function createQuestion(state, d, now) {
  const problems = questionProblems(d, now);
  if (problems.length) throw new Error(problems[0]);
  const q = {
    id: uid(),
    title: d.title.trim(),
    kind: d.kind,
    options: d.kind === "binary" ? ["Yes", "No"] : d.options.map((o) => String(o).trim()).filter(Boolean),
    category: d.category,
    region: d.region,
    closeAt: fromJmInput(d.closeLocal),
    sourceName: d.sourceName.trim(),
    sourceUrl: (d.sourceUrl || "").trim(),
    status: "open",
    outcome: null,
    createdAt: new Date(now).toISOString(),
  };
  return logged({ ...state, questions: [q, ...state.questions] }, { questionId: q.id, action: "create", note: q.title }, now);
}

/* Close a question early (now). Forecasts made from now on don't count. */
function closeQuestion(state, id, now) {
  const q = findQ(state, id);
  if (isClosed(q, now)) throw new Error("This question is already closed.");
  if (q.status !== "open" && q.status !== "disputed") throw new Error("This question is already settled.");
  return logged(putQ(state, { ...q, closeAt: new Date(now).toISOString() }), { questionId: id, action: "close" }, now);
}

/* Only a closed question can be resolved, always with a source link. A
   disputed question can be resolved again once the source is checked. */
function resolveQuestion(state, id, outcome, { sourceUrl, note }, now) {
  const q = findQ(state, id);
  if (q.status !== "open" && q.status !== "disputed") throw new Error("This question is already settled.");
  if (!isClosed(q, now)) throw new Error("Close the question before resolving it.");
  if (!Number.isInteger(outcome) || outcome < 0 || outcome >= q.options.length) throw new Error("Pick the outcome.");
  if (!isUrl(sourceUrl)) throw new Error("Add a link to the source (http:// or https://).");
  const next = { ...q, status: "resolved", outcome, resolvedAt: new Date(now).toISOString() };
  return logged(putQ(state, next), { questionId: id, action: "resolve", outcome: q.options[outcome], sourceUrl: sourceUrl.trim(), note: (note || "").trim() }, now);
}

/* SOP: resolution incident. Freeze the question (no forecasts, its points
   held back) while the source is checked. */
function disputeQuestion(state, id, note, now) {
  const q = findQ(state, id);
  if (q.status === "void" || q.status === "disputed") throw new Error("This question can't be disputed.");
  if (!String(note || "").trim()) throw new Error("Say what's disputed.");
  return logged(putQ(state, { ...q, status: "disputed", outcome: null, resolvedAt: null }), { questionId: id, action: "dispute", note: note.trim() }, now);
}

/* If the source is unclear, void the question: no points for anyone. */
function voidQuestion(state, id, { sourceUrl, note }, now) {
  const q = findQ(state, id);
  if (q.status === "void") throw new Error("This question is already void.");
  if (!String(note || "").trim()) throw new Error("Say why it's void.");
  if (sourceUrl && !isUrl(sourceUrl)) throw new Error("The link must start with http:// or https://.");
  return logged(putQ(state, { ...q, status: "void", outcome: null, resolvedAt: new Date(now).toISOString() }), { questionId: id, action: "void", sourceUrl: (sourceUrl || "").trim(), note: note.trim() }, now);
}

function deleteQuestion(state, id) {
  return {
    ...state,
    questions: state.questions.filter((q) => q.id !== id),
    forecasts: state.forecasts.filter((f) => f.questionId !== id),
    log: state.log.filter((l) => l.questionId !== id),
  };
}

function handleProblem(state, handle, selfId) {
  const h = String(handle || "").trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(h)) return "Handles are 3–20 letters, numbers or _.";
  if (state.players.some((p) => p.id !== selfId && p.handle.toLowerCase() === h.toLowerCase())) return "That handle is taken.";
  return null;
}
function addPlayer(state, { handle, parish, country }) {
  const problem = handleProblem(state, handle, null);
  if (problem) throw new Error(problem);
  const p = { id: uid(), handle: handle.trim(), parish: parish || "", country: country || "Jamaica" };
  return { ...state, players: [...state.players, p] };
}
function updateProfile(state, id, patch) {
  if (patch.handle != null) {
    const problem = handleProblem(state, patch.handle, id);
    if (problem) throw new Error(problem);
  }
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, ...patch, handle: (patch.handle ?? p.handle).trim() } : p)),
  };
}
function removePlayer(state, id) {
  if (id === ME) throw new Error("You can't remove yourself.");
  return { ...state, players: state.players.filter((p) => p.id !== id), forecasts: state.forecasts.filter((f) => f.playerId !== id) };
}

function hasSample(state) {
  return state.questions.some((q) => q.sample) || state.players.some((p) => p.sample);
}
/* Drop the sample questions and players, and everything that hangs off
   them. Your profile and anything you made yourself stay. */
function removeSample(state) {
  const qs = new Set(state.questions.filter((q) => q.sample).map((q) => q.id));
  const ps = new Set(state.players.filter((p) => p.sample).map((p) => p.id));
  return {
    ...state,
    questions: state.questions.filter((q) => !qs.has(q.id)),
    players: state.players.filter((p) => !ps.has(p.id)),
    forecasts: state.forecasts.filter((f) => !qs.has(f.questionId) && !ps.has(f.playerId)),
    log: state.log.filter((l) => !qs.has(l.questionId)),
  };
}

/* ---------- share text ---------- */

function shareCallText(q, probs, url) {
  return `My call on ${APP_NAME}: "${q.title}" ${fmtForecast(q, probs)}. What's yours?${url ? `\n${url}` : ""}`;
}
function leaderboardText(rows, title, url, by = "points") {
  const lines = rows.filter((r) => r.rank != null).slice(0, 10)
    .map((r) => `${r.rank}. ${r.player.handle}  ${by === "accuracy" ? `${roundAway(r.avgPoints)} a call` : roundAway(r.points)}`);
  return [`${APP_NAME} leaderboard · ${title}${by === "accuracy" ? " · accuracy" : ""}`, ...lines, "", "Make your call:" + (url ? ` ${url}` : "")].join("\n");
}

/* ---------- sample data ----------
   So the app has something in it the first time it opens. Every item is
   marked sample; Me → Data removes them all. Dates are relative to the
   first launch, so they're placeholders: check the real date and source
   before publishing a question like these. */

function sampleState(now) {
  const at = (days, hourJm = 19) => {
    const d = new Date(now + days * 86400000);
    const day = toJmInput(d.toISOString()).slice(0, 10);
    return fromJmInput(`${day}T${String(hourJm).padStart(2, "0")}:00`);
  };
  const created = new Date(now - 3 * 86400000).toISOString();
  const q = (id, o) => ({ id, status: "open", outcome: null, createdAt: created, sample: true, ...o });
  const questions = [
    q("s-boj", {
      title: "Will the Bank of Jamaica hold its policy rate at its next decision?",
      kind: "binary", options: ["Yes", "No"], category: "Economy", region: "JM", closeAt: at(9, 9),
      sourceName: "BOJ policy rate press release", sourceUrl: "https://boj.org.jm",
    }),
    q("s-champs", {
      title: "Which school wins Boys' Champs 2027?",
      kind: "choice", options: ["Kingston College", "Jamaica College", "Calabar", "STETHS", "Another school"],
      category: "Sport", region: "JM", closeAt: at(40, 9),
      sourceName: "ISSA official results", sourceUrl: "https://www.issasports.com",
    }),
    q("s-fx", {
      title: "Where will USD/JMD close on the last business day of the month?",
      kind: "range", options: ["Below 157.00", "157.00 to 158.99", "159.00 to 160.99", "161.00 or above"],
      category: "Economy", region: "JM", closeAt: at(5, 9),
      sourceName: "BOJ weighted average selling rate", sourceUrl: "https://boj.org.jm",
    }),
    q("s-boyz", {
      title: "Will the Reggae Boyz win their next official match?",
      kind: "binary", options: ["Yes", "No"], category: "Sport", region: "JM", closeAt: at(6, 15),
      sourceName: "JFF match report", sourceUrl: "https://www.jff.live",
    }),
    q("s-f1", {
      title: "Will the pole-sitter win the next Formula 1 Grand Prix?",
      kind: "binary", options: ["Yes", "No"], category: "Sport", region: "INTL", closeAt: at(-1, 8),
      sourceName: "Formula 1 official results", sourceUrl: "https://www.formula1.com",
    }),
    q("s-btc", {
      title: "Will Bitcoin end this week higher than it started?",
      kind: "binary", options: ["Yes", "No"], category: "Markets", region: "INTL", closeAt: at(3, 19),
      sourceName: "CoinGecko weekly close (Sunday, 7 pm Jamaica time)", sourceUrl: "https://www.coingecko.com",
    }),
    q("s-cpi", {
      title: "Will the next US CPI figure come in above the consensus forecast?",
      kind: "binary", options: ["Yes", "No"], category: "Economy", region: "INTL", closeAt: at(12, 8),
      sourceName: "US Bureau of Labor Statistics CPI release", sourceUrl: "https://www.bls.gov/cpi/",
    }),
  ];
  const players = [
    { id: ME, handle: "you", parish: "", country: "Jamaica" },
    { id: "s-kat", handle: "kingston_kat", parish: "St Andrew", country: "Jamaica", sample: true },
    { id: "s-ras", handle: "portie_ras", parish: "Portland", country: "Jamaica", sample: true },
    { id: "s-mike", handle: "mobay_mike", parish: "St James", country: "Jamaica", sample: true },
    { id: "s-dee", handle: "brixton_dee", parish: "St Catherine", country: "United Kingdom", sample: true },
    { id: "s-tash", handle: "toronto_tash", parish: "Manchester", country: "Canada", sample: true },
  ];
  // [player, question, probs, days ago]
  const picks = [
    ["s-kat", "s-boj", [70, 30], 2], ["s-ras", "s-boj", [55, 45], 1], ["s-mike", "s-boj", [80, 20], 2], ["s-dee", "s-boj", [65, 35], 1],
    ["s-kat", "s-champs", [45, 25, 15, 10, 5], 2], ["s-ras", "s-champs", [20, 20, 40, 10, 10], 1], ["s-tash", "s-champs", [30, 40, 10, 10, 10], 2],
    ["s-kat", "s-fx", [10, 50, 30, 10], 1], ["s-mike", "s-fx", [5, 35, 45, 15], 2],
    ["s-ras", "s-boyz", [60, 40], 1], ["s-mike", "s-boyz", [75, 25], 2], ["s-dee", "s-boyz", [50, 50], 1], ["s-tash", "s-boyz", [40, 60], 2],
    ["s-kat", "s-f1", [70, 30], 2], ["s-ras", "s-f1", [35, 65], 2], ["s-mike", "s-f1", [90, 10], 2], ["s-dee", "s-f1", [55, 45], 2], ["s-tash", "s-f1", [60, 40], 2],
    ["s-dee", "s-btc", [55, 45], 1], ["s-tash", "s-btc", [45, 55], 1],
    ["s-dee", "s-cpi", [40, 60], 1], ["s-mike", "s-cpi", [50, 50], 1],
  ];
  const forecasts = picks.map(([playerId, questionId, probs, ago], i) => ({
    id: `s-f${i}`, playerId, questionId, probs, createdAt: new Date(now - ago * 86400000 - i * 60000).toISOString(),
  }));
  return { questions, players, forecasts, log: [] };
}

/* ---------- storage ---------- */

function blankState() {
  return { theme: "auto", admin: true, sampleNotice: true, questions: [], players: [{ id: ME, handle: "you", parish: "", country: "Jamaica" }], forecasts: [], log: [] };
}
/* Keep only well-formed records, so a hand-edited or half-written backup
   can't crash the app. */
function sanitizeState(s) {
  const base = blankState();
  if (!s || typeof s !== "object") return base;
  const arr = (x) => (Array.isArray(x) ? x.filter((o) => o && typeof o === "object" && o.id) : []);
  // Links are only ever http(s): a backup can't slip in a javascript: link.
  const safeUrl = (u) => (isUrl(u) ? String(u).trim() : "");
  const questions = arr(s.questions)
    .filter((q) => typeof q.title === "string" && Array.isArray(q.options) && q.options.length >= 2 && !isNaN(Date.parse(q.closeAt)))
    .map((q) => ({ ...q, sourceUrl: safeUrl(q.sourceUrl) }));
  const qn = new Map(questions.map((q) => [q.id, q.options.length]));
  let players = arr(s.players).filter((p) => typeof p.handle === "string");
  if (!players.some((p) => p.id === ME)) players = [base.players[0], ...players];
  const pids = new Set(players.map((p) => p.id));
  const forecasts = arr(s.forecasts).filter((f) =>
    qn.has(f.questionId) && pids.has(f.playerId) && validProbs(f.probs, qn.get(f.questionId)) && !isNaN(Date.parse(f.createdAt)));
  return {
    theme: ["auto", "dark", "light"].includes(s.theme) ? s.theme : base.theme,
    admin: typeof s.admin === "boolean" ? s.admin : base.admin,
    sampleNotice: typeof s.sampleNotice === "boolean" ? s.sampleNotice : base.sampleNotice,
    questions, players, forecasts,
    log: arr(s.log).map((l) => ({ ...l, sourceUrl: safeUrl(l.sourceUrl) })),
  };
}
/* First launch: the sample data. After that: what was saved. */
function loadState(now) {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE); } catch {}
  if (raw == null) return { ...blankState(), ...sampleState(now) };
  try { return sanitizeState(JSON.parse(raw)); } catch {
    // Unreadable: keep a copy before the next save writes over it.
    try { localStorage.setItem(`${STORAGE}:unreadable`, raw); } catch {}
    return blankState();
  }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE, JSON.stringify(s)); } catch {}
}

const _exports = {
  APP_NAME, APP_VERSION, CONTACT_EMAIL, STORAGE, ME, JM_TZ, REGIONS, CATEGORIES, KINDS, MAX_OPTIONS, MIN_FOR_ACCURACY,
  PARISHES, COUNTRIES, NEW_QUESTION_CHECKS,
  uid, regionOf, sum, roundAway, fmtPts, fmtBrier,
  fmtWhen, toJmInput, fromJmInput, fmtIn,
  isClosed, phase, phaseLabel, ruleFlags, isUrl, questionProblems,
  validProbs, binaryProbs, minConfidence, pickProbs, pickOf, fmtForecast,
  countingForecast, latestForecasts, crowdOf,
  brier, pointsFor, coinFlipPoints, scoreAll, inLeague, leaderboard, parishTable,
  addForecast, createQuestion, closeQuestion, resolveQuestion, disputeQuestion, voidQuestion, deleteQuestion,
  handleProblem, addPlayer, updateProfile, removePlayer, hasSample, removeSample,
  shareCallText, leaderboardText,
  sampleState, blankState, sanitizeState, loadState, saveState,
};

if (typeof window !== "undefined") Object.assign(window, _exports);
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
