# Predikt

A free-to-play forecasting league for Jamaican events first (Champs, elections, the BOJ rate, the Reggae Boyz) and international ones second. Players make a call, the question resolves from a named public source, and accurate calls climb the leaderboard. **No money goes in or comes out.**

Working name. The theme, components and motion come from the WCO JFB Night Shift Calculator, so the two apps look and feel the same.

**Status: v0.2.** Online with Supabase: players sign in with an emailed code, and calls, scores and the leaderboard are shared. Without a Supabase project (or with **Me → Use this phone only**), the same app runs on one phone with sample data, which also works for keeping score in a WhatsApp league.

---

## Try it

Turn on GitHub Pages once: repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**. A minute later the app is at `https://ripponmarshall-netizen.github.io/predict/`. On an iPhone, open it in Safari, then **Share → Add to Home Screen**.

## What it does

- **Questions:** Jamaica / International / All; open, awaiting result and results, each with its category and region icon. Countdown to close in Jamaica time, with a pulsing dot in the last 24 hours.
- **Make a call:** Yes/No as a chance of Yes (slider plus 10/25/50/75/90 presets); options and number ranges as "the most likely one, and how sure" (the rest share what's left). Change it as often as you like; the latest call before close counts.
- **Crowd:** the average call, shown once you've made yours (so it doesn't anchor you) or once the question closes.
- **Scoring:** 0 to 100 points a call (below), with confetti for a sharp one.
- **Leaderboards:** All, Jamaica, Diaspora and your parish, ranked by **Points** or **Accuracy**; gold, silver and bronze for the top three; the parish table (Portland vs St Andrew). Share the top 10 to WhatsApp.
- **Sign in** with an emailed code (no password), then pick a handle and home parish.
- **Admin** (players marked admin in the database): write a question with the SOP checklist and a hard-rules word check, close early, resolve with a required source link, mark disputed (points on hold), void, and a public decision log.
- **On this phone only:** everything above with sample data, plus **Players** for recording calls made in WhatsApp, backup and restore.
- Dark and light themes, icons and spring animations throughout (calmed by the phone's Reduce Motion setting), works offline once loaded.

## How points work

Each call on a resolved question gets a **Brier score**: for every option, (your chance − what happened)², added up, where what happened is 1 for the outcome and 0 for the rest. 0 is perfect, 2 is sure and wrong.

**Points = 100 × (1 − Brier ÷ 2)**, so every call scores 0 to 100 and points never go below zero:

| Call on a Yes/No      | Points |
| --------------------- | -----: |
| 90% Yes, and it's Yes |     99 |
| 70% Yes, and it's Yes |     91 |
| 50%, either way       |     75 |
| 70% Yes, and it's No  |     51 |
| 90% Yes, and it's No  |     19 |
| 100% Yes, and it's No |      0 |

Why not keep the old "beat the coin flip" score and clamp it at zero? A clamp makes a wrong call free, so the best play becomes going 100% on every call, and the percentages stop meaning anything. A straight line from the Brier score keeps the floor at zero and stays honest: your best expected score always comes from calling what you really believe (`predikt.test.js` checks this for every belief from 0% to 100%).

The cost: every call earns something, so the **Points** total rewards turning up as well as being right. **Accuracy** ranks by points per call instead, from 3 scored calls. The formula lives in `pointsFor` in `helpers.jsx` and `score_question` in `supabase/schema.sql`; change both together.

## Going live with Supabase

The app talks to the Supabase project named in `config.js` (the **predict** project). The publishable key there is meant to be public: row-level security in the database decides what anyone can do. Never put the secret (service role) key in the app.

1. **Database:** Supabase → **SQL Editor** → paste `supabase/schema.sql` → **Run**, once. (It creates everything; running it twice fails, harmlessly, on "already exists".)
2. **Sign-in links back to the app:** **Authentication → URL Configuration**: set **Site URL** to `https://ripponmarshall-netizen.github.io/predict/` and add the same address under **Redirect URLs**.
3. **Send a code, not just a link:** **Authentication → Emails → Templates**, in both **Magic Link** and **Confirm signup**, put the code in the email, for example:

   ```html
   <h2>Your Predikt code</h2>
   <p>Type this code in the app: <strong>{{ .Token }}</strong></p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
   ```

   The code matters on an iPhone: a Home Screen app doesn't share Safari's sign-in, so a tapped link signs you in to Safari, not the app.

4. **Email for real players:** Supabase's built-in email is for testing. It's rate-limited and may only send to your own team's addresses (check the current limits). Before inviting players, add your own email service under **Authentication → Emails → SMTP Settings** (for example Resend or Brevo, which have free tiers).
5. **Make yourself admin:** sign in to the app and pick your handle, then in the **SQL Editor**: `update profiles set is_admin = true where handle = 'your_handle';` The Admin tab appears on the next refresh.

What the database enforces: players write only their own calls, only while a question is open, stamped with the server's clock; nobody sees anyone else's call until the question closes (`crowds()` gives the averages); only admins write, close and resolve questions; every decision is logged with its link; scoring runs in the database, never in the app; and nobody can make themselves admin. Points are summed from `scores` in the `leaderboard` view rather than stored on the profile, so they can't drift.

## Files

No build step: React 18, Babel and supabase-js load from a CDN at pinned versions (checked by integrity hashes), and each `.jsx` file is compiled in the browser, as in the Night Shift Calculator. Edit a file on GitHub and it's live.

| File                               | Purpose                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`                       | App shell, theme before first paint, loading screen, script loaders, service-worker registration                               |
| `config.js`                        | The Supabase project's address and publishable key (empty: phone only)                                                         |
| `styles.css`                       | Theme tokens (dark + light, from Night Shift), spring easings, all the motion, modals, tab bar, fields, slider                 |
| `helpers.jsx`                      | Pure JS: constants, Jamaica time, scoring, leaderboards, every state change (with its rules), sample data, storage             |
| `data.jsx`                         | Where the data lives: the same `api` for the phone (helpers.jsx) and Supabase (inserts and database functions), sign-in, cache |
| `icons.jsx`                        | The icon set: one stroke style, inline SVG                                                                                     |
| `components.jsx`                   | Shared UI from Night Shift (Card, SegToggle, buttons, sheets, toasts, confirm) plus tags, medals, avatars, confetti, loaders   |
| `questions.jsx`                    | Question list, question sheet (call, crowd, result, share) and the admin tools on a question                                   |
| `leaderboard.jsx`                  | Leagues, Points/Accuracy, the parish table                                                                                     |
| `me.jsx`                           | Profile, your record and calls, account, settings, backup; the profile and sign-in sheets                                      |
| `admin.jsx`                        | Needs a result, new question (with the SOP checklist), players, decision log                                                   |
| `app.jsx`                          | Root: phone or online, session, refresh, tabs, header, About                                                                   |
| `sw.js`                            | Service worker: precaches the app and CDN scripts so it opens offline; never caches live data                                  |
| `manifest.json`, `icon-*`          | PWA manifest and icons; `apple-touch-icon.png` is the iPhone Home Screen icon                                                  |
| `predikt.test.js`                  | Scoring, honesty, time, state changes, the online mapping and error messages                                                   |
| `check-jsx.js`                     | Every `.jsx` compiles, and `index.html`, `sw.js` and the manifest list the files that exist                                    |
| `supabase/schema.sql`              | The online database: tables, row-level security, scoring and admin functions                                                   |
| `supabase/test.sql`, `test.sh`     | Runs the schema on a real Postgres and tries what players and admins can and can't do                                          |
| `tests/e2e.js`, `fake-supabase.js` | The app in Chromium at iPhone size: phone mode, then three players online against a stand-in Supabase on Postgres              |

On the phone, state is saved under `predikt:v1` in `localStorage`. Online, the last data read is kept under `predikt:online` so the app opens straight away. Times are stored in UTC and shown in Jamaica time (UTC−5 all year).

## Adding to it

- **A new screen:** make `thing.jsx`, end it with `Object.assign(window, { ThingView })`, add `<script type="text/babel" src="thing.jsx">` to `index.html` above `app.jsx`, and add `./thing.jsx` to `ASSETS` in `sw.js`. `npm test` fails if you miss a step.
- **A new icon:** one line in `ICONS` in `icons.jsx`, then `<Icon name="…" />`.
- **A new region** (e.g. Caribbean): one line in `REGIONS` in `helpers.jsx`. The toggle and tags follow. Categories, parishes and countries are lists there too.
- **A new rule** (e.g. a cap on questions): put it in the state change in `helpers.jsx` (they throw a message the app shows), mirror it in `supabase/schema.sql`, and test both.
- **A database change:** add it to `schema.sql` (and `test.sql`), then run just the change in the SQL Editor; the full file is for a new project.
- **Release:** bump `APP_VERSION` in `helpers.jsx` and `CACHE` in `sw.js`. Without the `CACHE` bump, installed copies keep running the old files.

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
npm test              # unit tests, then the .jsx compile/wiring check
npm run lint
npm run format:check
./supabase/test.sh    # the schema on Postgres: needs psql and a server (PGHOST, PGUSER, PGPASSWORD)
npm run e2e           # the app in Chromium, phone and online: needs the same Postgres
```

CI runs all of them on every push and pull request.
