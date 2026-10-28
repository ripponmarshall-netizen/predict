/* predikt.test.js — scoring, time and state-change checks. Run: npm test */
const assert = require("assert");
const h = require("./helpers.jsx");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}
const near = (a, b, msg) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${msg || ""} ${a} ≠ ${b}`);

const NOW = Date.parse("2026-11-02T15:00:00Z"); // 10:00 am Jamaica time
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();

/* ---------- scoring ---------- */

test("Brier: perfect is 0, certain and wrong is 2", () => {
  near(h.brier([100, 0], 0), 0);
  near(h.brier([0, 100], 0), 2);
  near(h.brier([70, 30], 0), 0.18);
  near(h.brier([50, 50], 1), 0.5);
});

test("Points: 0 (certain and wrong) to 100 (certain and right), never below 0", () => {
  near(h.pointsFor([100, 0], 0), 100);
  near(h.pointsFor([0, 100], 0), 0);
  near(h.pointsFor([50, 50], 0), 75);
  near(h.pointsFor([90, 10], 0), 99);
  near(h.pointsFor([90, 10], 1), 19);
  near(h.pointsFor([70, 30], 1), 51);
  for (let n = 2; n <= h.MAX_OPTIONS; n++) {
    near(h.pointsFor(h.pickProbs(n, 0, 100), 1), 0, `n=${n} worst`);
  }
});

test("Points: the coin flip for n options", () => {
  near(h.coinFlipPoints(2), 75);
  near(h.pointsFor([25, 25, 25, 25], 2), h.coinFlipPoints(4));
  near(h.coinFlipPoints(4), 62.5);
  // 4 options, 70% on the right one, 10% on each other.
  near(h.pointsFor([70, 10, 10, 10], 0), 94);
});

test("Points stay honest: your best expected score is your real belief", () => {
  // If you think Yes is b% likely, calling exactly b% earns the most on
  // average. (A plain clamp at 0 fails this: it pays to go 100%.)
  const expected = (b, q) =>
    (b / 100) * h.pointsFor([q, 100 - q], 0) +
    (1 - b / 100) * h.pointsFor([q, 100 - q], 1);
  for (let b = 0; b <= 100; b += 5) {
    let best = 0;
    for (let q = 0; q <= 100; q++)
      if (expected(b, q) > expected(b, best) + 1e-9) best = q;
    assert.strictEqual(best, b, `belief ${b}% is best called as ${best}%`);
  }
});

test("fmtPts: whole numbers, half away from zero, thousands separated", () => {
  assert.strictEqual(h.fmtPts(2.5), "3");
  assert.strictEqual(h.fmtPts(0.4), "0");
  assert.strictEqual(h.fmtPts(1249.6), "1,250");
});

/* ---------- forecasts ---------- */

test("pickProbs: the pick gets the confidence, the rest share what's left", () => {
  assert.deepStrictEqual(h.pickProbs(4, 1, 70), [10, 70, 10, 10]);
  assert.deepStrictEqual(h.pickProbs(3, 0, 50), [50, 25, 25]);
  assert.deepStrictEqual(h.pickProbs(4, 3, 61), [13, 13, 13, 61]);
  assert.deepStrictEqual(
    h.pickProbs(3, 2, 10),
    [33, 33, 34],
    "never below an even spread",
  );
  assert.deepStrictEqual(h.pickProbs(5, 0, 100), [100, 0, 0, 0, 0]);
  for (let n = 2; n <= h.MAX_OPTIONS; n++) {
    for (let c = 0; c <= 100; c++) {
      const p = h.pickProbs(n, n - 1, c);
      assert.ok(h.validProbs(p, n), `n=${n} c=${c} ${p}`);
      if (c > h.minConfidence(n)) assert.strictEqual(h.pickOf(p).pick, n - 1);
    }
  }
});

test("validProbs: whole percentages, one per option, adding to 100", () => {
  assert.ok(h.validProbs([60, 40], 2));
  assert.ok(!h.validProbs([60, 41], 2));
  assert.ok(!h.validProbs([60.5, 39.5], 2));
  assert.ok(!h.validProbs([110, -10], 2));
  assert.ok(!h.validProbs([100], 2));
});

test("the latest forecast before close counts; later ones don't", () => {
  const q = { id: "q", closeAt: iso(NOW) };
  const fs = [
    {
      playerId: "a",
      questionId: "q",
      probs: [60, 40],
      createdAt: iso(NOW - 3 * DAY),
    },
    {
      playerId: "a",
      questionId: "q",
      probs: [80, 20],
      createdAt: iso(NOW - DAY),
    },
    { playerId: "a", questionId: "q", probs: [10, 90], createdAt: iso(NOW) },
    {
      playerId: "b",
      questionId: "q",
      probs: [30, 70],
      createdAt: iso(NOW - 2 * DAY),
    },
  ];
  assert.deepStrictEqual(h.countingForecast(fs, "a", q).probs, [80, 20]);
  const latest = h.latestForecasts(fs, [q]).get("q");
  assert.deepStrictEqual(latest.get("a").probs, [80, 20]);
  assert.deepStrictEqual(h.crowdOf(latest, 2), { count: 2, probs: [55, 45] });
});

/* ---------- Jamaica time ---------- */

test("Jamaica time is UTC−5 all year, both ways", () => {
  assert.strictEqual(
    h.fromJmInput("2026-11-05T19:00"),
    "2026-11-06T00:00:00.000Z",
  );
  assert.strictEqual(
    h.fromJmInput("2027-07-01T09:30"),
    "2027-07-01T14:30:00.000Z",
  );
  assert.strictEqual(
    h.toJmInput("2026-11-06T00:00:00.000Z"),
    "2026-11-05T19:00",
  );
  assert.strictEqual(h.fromJmInput("nonsense"), null);
  assert.strictEqual(
    h.fmtWhen("2026-11-06T00:00:00.000Z"),
    "Thu 5 Nov, 7:00 pm",
  );
});

/* ---------- questions ---------- */

const goodDraft = (o) => ({
  title: "Will the BOJ hold the policy rate in November?",
  kind: "binary",
  options: [],
  category: "Economy",
  region: "JM",
  closeLocal: h.toJmInput(iso(NOW + 5 * DAY)),
  sourceName: "BOJ press release",
  sourceUrl: "https://boj.org.jm",
  checks: { clear: true, source: true, close: true, rules: true },
  ...o,
});

test("a new question needs the checklist, a source and a future close", () => {
  assert.deepStrictEqual(h.questionProblems(goodDraft(), NOW), []);
  assert.ok(
    h.questionProblems(goodDraft({ checks: { clear: true } }), NOW).length,
  );
  assert.ok(h.questionProblems(goodDraft({ sourceName: "" }), NOW).length);
  assert.ok(
    h.questionProblems(goodDraft({ sourceUrl: "boj.org.jm" }), NOW).length,
  );
  assert.ok(
    h.questionProblems(
      goodDraft({ closeLocal: h.toJmInput(iso(NOW - DAY)) }),
      NOW,
    ).length,
  );
  assert.ok(
    h.questionProblems(goodDraft({ title: "Will BOJ hold" }), NOW).length,
    "needs a ?",
  );
  assert.ok(
    h.questionProblems(goodDraft({ kind: "choice", options: ["A", "a"] }), NOW)
      .length,
    "duplicate options",
  );
  assert.deepStrictEqual(
    h.questionProblems(
      goodDraft({ kind: "choice", options: ["KC", "JC", " "] }),
      NOW,
    ),
    [],
  );
});

test("rule words prompt a check", () => {
  assert.deepStrictEqual(h.ruleFlags("Will the accused be charged?"), [
    "charged",
  ]);
  assert.deepStrictEqual(h.ruleFlags("Will BOJ hold?"), []);
});

/* ---------- the whole loop ---------- */

function world() {
  let s = h.blankState();
  s = h.addPlayer(s, {
    handle: "kat",
    parish: "St Andrew",
    country: "Jamaica",
  });
  s = h.addPlayer(s, {
    handle: "dee",
    parish: "St Andrew",
    country: "United Kingdom",
  });
  s = h.updateProfile(s, h.ME, { handle: "rippon", parish: "Portland" });
  s = h.createQuestion(s, goodDraft(), NOW);
  const qid = s.questions[0].id;
  const kat = s.players.find((p) => p.handle === "kat").id;
  const dee = s.players.find((p) => p.handle === "dee").id;
  return { s, qid, kat, dee };
}

test("forecast, close, resolve, score", () => {
  let { s, qid, kat, dee } = world();
  s = h.addForecast(
    s,
    { playerId: h.ME, questionId: qid, probs: [90, 10] },
    NOW + 1000,
  );
  s = h.addForecast(
    s,
    { playerId: kat, questionId: qid, probs: [30, 70] },
    NOW + 2000,
  );
  s = h.addForecast(
    s,
    { playerId: dee, questionId: qid, probs: [50, 50], by: "admin" },
    NOW + 3000,
  );
  assert.strictEqual(s.forecasts[2].by, "admin");
  assert.throws(
    () =>
      h.resolveQuestion(
        s,
        qid,
        0,
        { sourceUrl: "https://boj.org.jm" },
        NOW + 4000,
      ),
    /Close the question/,
  );
  s = h.closeQuestion(s, qid, NOW + 5000);
  assert.throws(
    () =>
      h.addForecast(
        s,
        { playerId: kat, questionId: qid, probs: [99, 1] },
        NOW + 6000,
      ),
    /closed/,
  );
  assert.throws(
    () => h.resolveQuestion(s, qid, 0, { sourceUrl: "" }, NOW + 7000),
    /link/,
  );
  s = h.resolveQuestion(
    s,
    qid,
    0,
    { sourceUrl: "https://boj.org.jm/x", note: "Held at 6%" },
    NOW + 8000,
  );
  assert.strictEqual(s.log[0].action, "resolve");
  assert.strictEqual(s.log[0].outcome, "Yes");

  const sc = h.scoreAll(s);
  near(sc.byPlayer.get(h.ME).points, 99);
  near(sc.byPlayer.get(kat).points, 51);
  near(sc.byPlayer.get(dee).points, 75);
  assert.deepStrictEqual(sc.crowds.get(qid), {
    count: 3,
    probs: [170 / 3, 130 / 3],
  });
  const rows = h.leaderboard(s, sc, "all");
  assert.deepStrictEqual(
    rows.map((r) => [r.player.handle, r.rank]),
    [
      ["rippon", 1],
      ["dee", 2],
      ["kat", 3],
    ],
  );
  assert.deepStrictEqual(
    h.leaderboard(s, sc, "jm").map((r) => r.player.handle),
    ["rippon", "kat"],
  );
  assert.deepStrictEqual(
    h.leaderboard(s, sc, "diaspora").map((r) => r.player.handle),
    ["dee"],
  );
  assert.deepStrictEqual(
    h.leaderboard(s, sc, "parish", "St Andrew").map((r) => r.player.handle),
    ["dee", "kat"],
  );
  const table = h.parishTable(s, sc);
  assert.deepStrictEqual(
    table.map((t) => [t.parish, t.players, Math.round(t.avg)]),
    [
      ["Portland", 1, 99],
      ["St Andrew", 2, 63],
    ],
  );
  assert.match(h.leaderboardText(rows, "All players"), /1\. rippon {2}99/);
});

test("accuracy ranks by points per call, from three scored calls", () => {
  let { s, kat, dee } = world();
  // kat: three calls, all 90% and right (99 each). dee: one perfect call.
  for (let i = 0; i < 3; i++) {
    s = h.createQuestion(
      s,
      goodDraft({ title: `Will question ${i} come true?` }),
      NOW,
    );
    const id = s.questions[0].id;
    s = h.addForecast(
      s,
      { playerId: kat, questionId: id, probs: [90, 10] },
      NOW + 1,
    );
    if (i === 0)
      s = h.addForecast(
        s,
        { playerId: dee, questionId: id, probs: [100, 0] },
        NOW + 1,
      );
    s = h.closeQuestion(s, id, NOW + 2);
    s = h.resolveQuestion(s, id, 0, { sourceUrl: "https://x.org" }, NOW + 3);
  }
  const sc = h.scoreAll(s);
  assert.deepStrictEqual(
    h
      .leaderboard(s, sc, "all", null, "points")
      .map((r) => [r.player.handle, r.rank]),
    [
      ["kat", 1],
      ["dee", 2],
      ["rippon", null],
    ],
  );
  const acc = h.leaderboard(s, sc, "all", null, "accuracy");
  assert.deepStrictEqual(
    acc.map((r) => [r.player.handle, r.rank]),
    [
      ["kat", 1],
      ["dee", null],
      ["rippon", null],
    ],
  );
  near(acc[0].avgPoints, 99);
  assert.match(
    h.leaderboardText(acc, "All", "", "accuracy"),
    /1\. kat {2}99 a call/,
  );
  // Signed out (online), you aren't listed.
  assert.ok(
    !h
      .leaderboard({ ...s, signedOut: true }, sc, "all")
      .some((r) => r.player.id === h.ME),
  );
});

test("only players with a scored call are ranked", () => {
  let { s, qid, kat, dee } = world();
  s = h.addForecast(
    s,
    { playerId: kat, questionId: qid, probs: [10, 90] },
    NOW + 1000,
  );
  s = h.createQuestion(
    s,
    goodDraft({ title: "Will it rain in Port Antonio on Friday?" }),
    NOW,
  );
  s = h.addForecast(
    s,
    { playerId: dee, questionId: s.questions[0].id, probs: [60, 40] },
    NOW + 1000,
  );
  s = h.closeQuestion(s, qid, NOW + 2000);
  s = h.resolveQuestion(
    s,
    qid,
    0,
    { sourceUrl: "https://boj.org.jm" },
    NOW + 3000,
  );
  const rows = h.leaderboard(s, h.scoreAll(s), "all");
  // kat scored (badly) and is ranked; you and dee have nothing scored yet.
  assert.deepStrictEqual(
    rows.map((r) => [r.player.handle, r.rank]),
    [
      ["kat", 1],
      ["dee", null],
      ["rippon", null],
    ],
  );
  assert.ok(!/dee|rippon/.test(h.leaderboardText(rows, "All")));
});

test("dispute holds points; resolve again or void", () => {
  let { s, qid, kat } = world();
  s = h.addForecast(
    s,
    { playerId: kat, questionId: qid, probs: [80, 20] },
    NOW + 1000,
  );
  s = h.closeQuestion(s, qid, NOW + 2000);
  s = h.resolveQuestion(
    s,
    qid,
    1,
    { sourceUrl: "https://boj.org.jm" },
    NOW + 3000,
  );
  near(h.scoreAll(s).byPlayer.get(kat).points, 36);
  assert.throws(() => h.disputeQuestion(s, qid, "", NOW), /disputed/);
  s = h.disputeQuestion(s, qid, "Wrong press release", NOW + 4000);
  assert.strictEqual(
    h.scoreAll(s).byPlayer.get(kat),
    undefined,
    "points on hold",
  );
  assert.throws(
    () =>
      h.addForecast(
        s,
        { playerId: kat, questionId: qid, probs: [50, 50] },
        NOW + 5000,
      ),
    /closed/,
  );
  const resolved = h.resolveQuestion(
    s,
    qid,
    0,
    { sourceUrl: "https://boj.org.jm/right" },
    NOW + 6000,
  );
  near(h.scoreAll(resolved).byPlayer.get(kat).points, 96);
  const voided = h.voidQuestion(s, qid, { note: "Source unclear" }, NOW + 6000);
  assert.strictEqual(h.scoreAll(voided).byPlayer.get(kat), undefined);
  assert.throws(
    () =>
      h.resolveQuestion(
        voided,
        qid,
        0,
        { sourceUrl: "https://x.org" },
        NOW + 7000,
      ),
    /settled/,
  );
  assert.deepStrictEqual(
    voided.log.map((l) => l.action),
    ["void", "dispute", "resolve", "close", "create"],
  );
});

test("a question disputed before it closes can be closed, then resolved", () => {
  let { s, qid } = world();
  s = h.disputeQuestion(s, qid, "Wording is ambiguous", NOW + 1000);
  assert.throws(
    () =>
      h.resolveQuestion(
        s,
        qid,
        0,
        { sourceUrl: "https://boj.org.jm" },
        NOW + 2000,
      ),
    /Close the question/,
  );
  s = h.closeQuestion(s, qid, NOW + 3000);
  s = h.resolveQuestion(
    s,
    qid,
    0,
    { sourceUrl: "https://boj.org.jm" },
    NOW + 4000,
  );
  assert.strictEqual(s.questions[0].status, "resolved");
});

test("handles are unique, ignoring case", () => {
  const { s } = world();
  assert.throws(() => h.addPlayer(s, { handle: "KAT" }), /taken/);
  assert.throws(() => h.addPlayer(s, { handle: "a b" }), /Handles/);
  assert.doesNotThrow(() => h.updateProfile(s, h.ME, { handle: "Rippon" }));
});

/* ---------- sample data and storage ---------- */

test("sample data is valid and removable", () => {
  const s = h.sanitizeState({ ...h.blankState(), ...h.sampleState(NOW) });
  const raw = h.sampleState(NOW);
  assert.strictEqual(s.questions.length, raw.questions.length);
  assert.strictEqual(
    s.forecasts.length,
    raw.forecasts.length,
    "every sample forecast survives sanitising",
  );
  assert.ok(
    s.forecasts.every((f) => {
      const q = s.questions.find((x) => x.id === f.questionId);
      return Date.parse(f.createdAt) < Date.parse(q.closeAt);
    }),
    "sample forecasts are made before their question closes",
  );
  assert.ok(
    s.questions.some((q) => h.phase(q, NOW) === "closed"),
    "one sample is waiting for a result",
  );
  assert.ok(h.hasSample(s));
  const clean = h.removeSample(s);
  assert.ok(!h.hasSample(clean));
  assert.deepStrictEqual(
    clean.players.map((p) => p.id),
    [h.ME],
  );
  assert.strictEqual(clean.forecasts.length, 0);
});

test("sanitizeState drops broken records and keeps you", () => {
  const s = h.sanitizeState({
    theme: "neon",
    players: [{ id: "x", handle: "x" }],
    questions: [
      { id: "q", title: "Q?", options: ["Yes", "No"], closeAt: iso(NOW) },
      { id: "bad" },
    ],
    forecasts: [
      {
        id: "f1",
        playerId: "x",
        questionId: "q",
        probs: [50, 50],
        createdAt: iso(NOW),
      },
      {
        id: "f2",
        playerId: "x",
        questionId: "q",
        probs: [50, 60],
        createdAt: iso(NOW),
      },
      {
        id: "f3",
        playerId: "ghost",
        questionId: "q",
        probs: [50, 50],
        createdAt: iso(NOW),
      },
    ],
  });
  assert.strictEqual(s.theme, "auto");
  const evil = h.sanitizeState({
    questions: [
      {
        id: "q",
        title: "Q?",
        options: ["Yes", "No"],
        closeAt: iso(NOW),
        sourceUrl: "javascript:alert(1)",
      },
    ],
    log: [
      { id: "l", sourceUrl: "javascript:alert(1)" },
      { id: "m", sourceUrl: "https://boj.org.jm" },
    ],
  });
  assert.strictEqual(
    evil.questions[0].sourceUrl,
    "",
    "no javascript: links from a backup",
  );
  assert.deepStrictEqual(
    evil.log.map((l) => l.sourceUrl),
    ["", "https://boj.org.jm"],
  );
  assert.deepStrictEqual(
    s.players.map((p) => p.id),
    [h.ME, "x"],
  );
  assert.deepStrictEqual(
    s.questions.map((q) => q.id),
    ["q"],
  );
  assert.deepStrictEqual(
    s.forecasts.map((f) => f.id),
    ["f1"],
  );
});

/* ---------- online (data.jsx) ---------- */

const d = require("./data.jsx");
const UID = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const rawOnline = () => ({
  questions: [
    {
      id: "q1",
      title: "Will the BOJ hold?",
      kind: "binary",
      options: ["Yes", "No"],
      category: "Economy",
      region: "JM",
      close_at: "2026-11-05T14:00:00+00:00",
      resolution_source: "BOJ",
      resolution_url: "javascript:alert(1)",
      status: "resolved",
      outcome: 0,
      resolved_at: "2026-11-05T20:00:00+00:00",
      created_at: "2026-11-01T12:00:00+00:00",
    },
  ],
  board: [
    {
      id: UID,
      handle: "rippon",
      parish: "Portland",
      country: "Jamaica",
      points: 99,
      scored: 1,
      avg_brier: 0.02,
    },
    {
      id: OTHER,
      handle: "kat",
      parish: null,
      country: "Jamaica",
      points: 0,
      scored: 0,
      avg_brier: null,
    },
  ],
  profile: {
    id: UID,
    handle: "rippon",
    parish: "Portland",
    country: "Jamaica",
    is_admin: true,
  },
  myScores: [{ question_id: "q1", points: 99, brier: 0.02 }],
  myForecasts: [
    {
      id: 7,
      question_id: "q1",
      probs: [90, 10],
      created_at: "2026-11-02T12:00:00+00:00",
    },
  ],
  log: [
    {
      id: 3,
      question_id: "q1",
      action: "resolve",
      outcome: "Yes",
      source_url: "https://boj.org.jm",
      note: null,
      at: "2026-11-05T20:00:00+00:00",
    },
  ],
  crowds: [{ question_id: "q1", calls: 2, probs: [70, 30] }],
});

test("online rows become the app's state, with you as ME", () => {
  const st = d.fromRemote(rawOnline(), UID);
  assert.deepStrictEqual(
    st.players.map((p) => p.id),
    [h.ME, OTHER],
  );
  assert.strictEqual(st.players[1].parish, "");
  assert.strictEqual(st.questions[0].closeAt, "2026-11-05T14:00:00+00:00");
  assert.strictEqual(
    st.questions[0].sourceUrl,
    "",
    "no javascript: links from the database either",
  );
  assert.deepStrictEqual(st.forecasts[0], {
    id: "7",
    playerId: h.ME,
    questionId: "q1",
    probs: [90, 10],
    createdAt: "2026-11-02T12:00:00+00:00",
  });
  assert.strictEqual(st.log[0].sourceUrl, "https://boj.org.jm");
  assert.deepStrictEqual(
    [st.signedOut, st.needsProfile, st.isAdmin],
    [false, false, true],
  );
  const sc = d.remoteScores(st, rawOnline(), UID);
  assert.deepStrictEqual(sc.byPlayer.get(h.ME), {
    points: 99,
    scored: 1,
    brierSum: 0.02,
  });
  assert.ok(!sc.byPlayer.has(OTHER), "no scored calls, no entry");
  assert.deepStrictEqual(sc.byQuestion.get("q1").get(h.ME), {
    points: 99,
    brier: 0.02,
  });
  assert.deepStrictEqual(sc.crowds.get("q1"), { count: 2, probs: [70, 30] });
  assert.deepStrictEqual(sc.latest.get("q1").get(h.ME).probs, [90, 10]);
  // The same leaderboard code ranks online players.
  assert.deepStrictEqual(
    h.leaderboard(st, sc, "all").map((r) => [r.player.handle, r.rank]),
    [["rippon", 1]],
  );
});

test("online times are trimmed to milliseconds", () => {
  assert.strictEqual(
    d.ts("2026-10-28T03:06:00.123456+00:00"),
    "2026-10-28T03:06:00.123+00:00",
  );
  assert.strictEqual(
    d.ts("2026-10-28T03:06:00+00:00"),
    "2026-10-28T03:06:00+00:00",
  );
  assert.strictEqual(d.ts(null), null);
  const raw = rawOnline();
  raw.questions[0].close_at = "2026-11-05T14:00:00.987654+00:00";
  assert.strictEqual(
    d.fromRemote(raw, UID).questions[0].closeAt,
    "2026-11-05T14:00:00.987+00:00",
  );
});

test("online: signed out, and signed in without a profile yet", () => {
  const out = d.fromRemote(
    { ...rawOnline(), profile: null, myScores: [], myForecasts: [] },
    null,
  );
  assert.strictEqual(out.signedOut, true);
  assert.ok(
    out.players.some((p) => p.id === UID),
    "your row is just another player when signed out",
  );
  assert.ok(
    !h
      .leaderboard(out, d.remoteScores(out, rawOnline(), null), "all")
      .some((r) => r.player.id === h.ME),
  );
  const fresh = d.fromRemote({ ...rawOnline(), board: [], profile: null }, UID);
  assert.deepStrictEqual(
    [fresh.signedOut, fresh.needsProfile, fresh.isAdmin],
    [false, true, false],
  );
  assert.strictEqual(fresh.players.find((p) => p.id === h.ME).handle, "you");
});

test("errors read as something a player can act on", () => {
  const f = d.friendlyError;
  assert.strictEqual(
    f({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "profiles_handle_key"',
    }),
    "That handle is taken.",
  );
  assert.match(
    f({ code: "42501", message: "new row violates row-level security policy" }),
    /not allowed/,
  );
  assert.match(f(new TypeError("Load failed")), /Couldn't reach/);
  assert.match(f(new TypeError("Failed to fetch")), /Couldn't reach/);
  assert.strictEqual(
    f({ code: "P0001", message: "This question has closed." }),
    "This question has closed.",
  );
  assert.match(
    f({ message: "Token has expired or is invalid" }),
    /code is wrong/,
  );
  assert.match(
    f({ status: 429, message: "email rate limit exceeded" }),
    /Too many/,
  );
});

test("the phone api applies the same state changes", () => {
  let st = h.blankState();
  const api = d.localApi(
    () => st,
    (next) => {
      st = next;
    },
  );
  // The phone api uses the real clock, so the close time must be from now.
  api.createQuestion(
    goodDraft({ closeLocal: h.toJmInput(iso(Date.now() + 5 * DAY)) }),
  );
  const id = st.questions[0].id;
  api.forecast(id, [80, 20]);
  api.addPlayer({ handle: "kat" });
  const kat = st.players.find((p) => p.handle === "kat").id;
  api.recordFor(kat, id, [40, 60]);
  assert.deepStrictEqual(
    st.forecasts.map((f) => [f.playerId, f.by]),
    [
      [h.ME, undefined],
      [kat, "admin"],
    ],
  );
  assert.throws(() => api.forecast(id, [80, 21]), /adding up to 100/);
  assert.strictEqual(d.dataMode(), "local", "no config in Node: local");
});

console.log(`${passed} tests passed`);
