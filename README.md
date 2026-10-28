# Predikt

A free-to-play forecasting league for Jamaican events first (Champs, elections, the BOJ rate, the Reggae Boyz) and international ones second. Players make a call, the question resolves from a named public source, and accurate calls climb the leaderboard. **No money goes in or comes out.**

Working name. The theme, components and motion come from the WCO JFB Night Shift Calculator, so the two apps look and feel the same.

**Status: v0.1, local prototype.** Everything runs and saves on the phone (`localStorage`); there are no accounts and no shared leaderboard yet. The database for the online version is in `supabase/`, ready and tested, but the app doesn't use it yet.

---

## Try it

Turn on GitHub Pages once: repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**. A minute later the app is at `https://ripponmarshall-netizen.github.io/predict/`. On an iPhone, open it in Safari, then **Share → Add to Home Screen**.

The first launch loads sample questions and players (marked **Sample**) so there's something to try. One sample question has already closed: resolve it in **Admin** to see scoring. **Me → Data → Remove samples** clears them.

## What v0.1 does

- **Questions:** Jamaica / International / All toggle; open, awaiting result and results lists. Countdown to close, in Jamaica time.
- **Make a call:** Yes/No as a chance of Yes (slider plus 10/25/50/75/90 presets); options and number ranges as "the most likely one, and how sure" (the rest share what's left). Change it as often as you like; the latest call before close counts.
- **Crowd:** the average call, shown once you've made yours (so it doesn't anchor you) or once the question closes.
- **Scoring:** Brier score, turned into points against a coin flip (below).
- **Leaderboards:** All, Jamaica, Diaspora, your parish, and the parish table (Portland vs St Andrew). Share the top 10 to WhatsApp.
- **Share your call** through the phone's share sheet (WhatsApp, Instagram), or copied where there isn't one.
- **Admin** (Me → Settings → Admin tools): write a question with the SOP checklist, close early, resolve with a required source link, mark disputed (points on hold), void, and a decision log. **Players** lets you add people and record their calls by hand, so the app can run the Stage 1 WhatsApp league instead of a Google Sheet.
- **About & rules:** how points work, the hard rules, how results are settled.
- Dark and light themes, works offline once loaded, backup and restore as JSON.

## How points work

Each call on a resolved question gets a **Brier score**: for every option, (your chance − what happened)², added up, where what happened is 1 for the outcome and 0 for the rest. 0 is perfect, 2 is certain and wrong.

**Points = 100 × (1 − Brier ÷ coin-flip Brier).** The coin flip is an even spread across the options (Brier 0.5 on a Yes/No), so:

| Call on a Yes/No      | Points |
| --------------------- | -----: |
| 90% Yes, and it's Yes |    +96 |
| 70% Yes, and it's Yes |    +64 |
| 50%, either way       |      0 |
| 70% Yes, and it's No  |    −96 |
| 90% Yes, and it's No  |   −224 |
| 100% Yes, and it's No |   −300 |

Why not just reward every call? With "100 − Brier" style points, someone who calls 50% on everything climbs the table on volume alone. Scoring against the coin flip means points only come from being better than a guess. Only players with a scored call are ranked, so sitting out can't beat a negative score. This is a design choice to test, not a given: if negative scores put casual players off, the formula lives in one place (`pointsFor` in `helpers.jsx`, `score_question` in `supabase/schema.sql`).

## Files

No build step: React 18 and Babel are loaded from a CDN at pinned versions, and each `.jsx` file is compiled in the browser, as in the Night Shift Calculator. Edit a file on GitHub and it's live.

| File                           | Purpose                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                   | App shell, theme before first paint, loading screen, script loaders, service-worker registration                          |
| `styles.css`                   | Theme tokens (dark + light, from Night Shift), spring easings, motion, modals, tab bar, fields, slider                    |
| `helpers.jsx`                  | Pure JS: constants, Jamaica time, scoring, leaderboards, every state change (with its rules), sample data, storage        |
| `components.jsx`               | Shared UI from Night Shift (Card, SegToggle, buttons, sheets, toasts, confirm) plus tags, probability bars, share, footer |
| `questions.jsx`                | Question list, question sheet (call, crowd, result, share) and the admin tools on a question                              |
| `leaderboard.jsx`              | Leagues and the parish table                                                                                              |
| `me.jsx`                       | Profile, your record and calls, settings, backup                                                                          |
| `admin.jsx`                    | Needs a result, new question (with the SOP checklist), players, decision log                                              |
| `app.jsx`                      | Root: state, saving, tabs, header, About                                                                                  |
| `sw.js`                        | Cache-first service worker; precaches the app and the pinned CDN scripts so it opens offline                              |
| `manifest.json`, `icon-*`      | PWA manifest and icons; `apple-touch-icon.png` is the iPhone Home Screen icon                                             |
| `predikt.test.js`              | Scoring, time and state-change tests                                                                                      |
| `check-jsx.js`                 | Every `.jsx` compiles, and `index.html`, `sw.js` and the manifest list the files that exist                               |
| `supabase/schema.sql`          | The online database: tables, row-level security, scoring and admin functions                                              |
| `supabase/test.sql`, `test.sh` | Runs the schema on a real Postgres and tries what players and admins can and can't do                                     |

State is saved under `predikt:v1` in `localStorage`: `questions`, `players` (you are id `me`), `forecasts` (append-only, whole percentages per option), `log`, and settings. Times are stored in UTC and shown in Jamaica time (UTC−5 all year).

## Adding to it

- **A new screen:** make `thing.jsx`, end it with `Object.assign(window, { ThingView })`, add `<script type="text/babel" src="thing.jsx">` to `index.html` above `app.jsx`, and add `./thing.jsx` to `ASSETS` in `sw.js`. `npm test` fails if you miss a step.
- **A new region** (e.g. Caribbean): one line in `REGIONS` in `helpers.jsx`. The toggle and tags follow. Categories, parishes and countries are lists there too.
- **A new rule** (e.g. a cap on questions): put it in the state change in `helpers.jsx` (they throw a message the app shows as a toast), add a test in `predikt.test.js`, and mirror it in `supabase/schema.sql`.
- **Release:** bump `APP_VERSION` in `helpers.jsx` and `CACHE` in `sw.js`. Without the `CACHE` bump, installed copies keep running the old files.

## Going online (Stage 2)

1. Create a Supabase project. Check the free tier's current limits.
2. **SQL Editor:** paste in `supabase/schema.sql` and run it once.
3. **Authentication:** turn on email sign-in with confirmation (the plan's guard against spam accounts).
4. Sign up in the app, then make yourself admin in the SQL Editor: `update profiles set is_admin = true where handle = 'your_handle';`
5. In the app, load `@supabase/supabase-js@2` from the CDN and swap each local state change for its database call:

| `helpers.jsx`              | Supabase (JS v2)                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `addForecast`              | `supabase.from("forecasts").insert({ question_id, probs })`                                                                  |
| `createQuestion`           | `supabase.from("questions").insert({ title, kind, options, category, region, close_at, resolution_source, resolution_url })` |
| `closeQuestion`            | `supabase.rpc("close_question", { q_id })`                                                                                   |
| `resolveQuestion`          | `supabase.rpc("resolve_question", { q_id, outcome_index, source_url, note })`                                                |
| `disputeQuestion`          | `supabase.rpc("dispute_question", { q_id, note })`                                                                           |
| `voidQuestion`             | `supabase.rpc("void_question", { q_id, note, source_url })`                                                                  |
| `scoreAll` / `leaderboard` | `supabase.from("leaderboard").select()`                                                                                      |
| `crowdOf`                  | `supabase.rpc("crowd", { q_id })`                                                                                            |

What the database enforces: players write only their own calls, only while a question is open, stamped with the server's clock; nobody sees anyone else's call until the question closes (the crowd average comes from `crowd()`); only admins write, close and resolve questions; every decision is logged with its link; scoring runs in the database, never in the app; and nobody can make themselves admin. Points are summed from `scores` in the `leaderboard` view rather than stored on the profile, so they can't drift. Calls recorded by hand for WhatsApp players are a local-only feature: online, each player signs in.

## Next (from the plan's build order)

- **Week 3:** share cards as images for WhatsApp and Instagram; private leagues (`leagues` and `league_members` tables, join by code).
- **Later:** push notifications before a question closes, Caribbean regions, sponsor pages.

## Hard rules

- Points can never be bought, sold, transferred or exchanged for cash or goods.
- No entry fee for any league that has a prize. Sponsor prizes only after legal advice, free entry only, skill-based scoring only, 18+.
- No questions on deaths, crimes against named people, or minors' personal outcomes. (The new-question form flags risky words; the checklist must be ticked.)

## Checks

```bash
npm ci
npm test              # scoring and state tests, then the .jsx compile/wiring check
npm run lint
npm run format:check
./supabase/test.sh    # needs psql and a Postgres server (PGHOST, PGUSER, PGPASSWORD)
```

CI runs all of them on every push and pull request.
