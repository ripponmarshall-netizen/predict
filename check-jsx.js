/* check-jsx.js — catch what would leave a blank screen on the phone:
   a .jsx file that doesn't compile, or one that index.html doesn't load or
   the service worker doesn't cache (so it never updates offline). Run: npm test */
const fs = require("fs");
const path = require("path");
const Babel = require("@babel/standalone");

const root = __dirname;
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const problems = [];

// 1. Every .jsx compiles with the presets the browser uses for
//    <script type="text/babel"> (react + env).
const jsx = fs.readdirSync(root).filter((f) => f.endsWith(".jsx"));
for (const f of jsx) {
  try {
    Babel.transform(read(f), { presets: ["react", "env"], filename: f });
  } catch (e) {
    problems.push(`${f} doesn't compile: ${e.message.split("\n")[0]}`);
  }
}

// 2. index.html loads each one, and each one it loads exists.
const html = read("index.html");
const loaded = [
  ...html.matchAll(/<script type="text\/babel" src="([^"]+)"/g),
].map((m) => m[1]);
for (const f of jsx)
  if (!loaded.includes(f)) problems.push(`index.html doesn't load ${f}`);
for (const f of loaded)
  if (!fs.existsSync(path.join(root, f)))
    problems.push(`index.html loads ${f}, which doesn't exist`);
if (loaded[0] !== "helpers.jsx") problems.push("helpers.jsx must load first");
if (!/<script src="config\.js"><\/script>/.test(html))
  problems.push("index.html doesn't load config.js");
if (loaded[loaded.length - 1] !== "app.jsx")
  problems.push("app.jsx must load last");

// 3. The service worker precaches every app file, and nothing missing.
const sw = read("sw.js");
const assets = [
  ...sw
    .slice(
      sw.indexOf("const ASSETS"),
      sw.indexOf("];", sw.indexOf("const ASSETS")),
    )
    .matchAll(/"\.\/([^"]*)"/g),
].map((m) => m[1]);
for (const f of [
  ...jsx,
  "index.html",
  "styles.css",
  "manifest.json",
  "config.js",
]) {
  if (!assets.includes(f)) problems.push(`sw.js ASSETS is missing ./${f}`);
}
for (const f of assets)
  if (f && !fs.existsSync(path.join(root, f)))
    problems.push(`sw.js caches ./${f}, which doesn't exist`);

// 4. The manifest parses and its icons exist.
try {
  const m = JSON.parse(read("manifest.json"));
  for (const i of m.icons || [])
    if (!fs.existsSync(path.join(root, i.src)))
      problems.push(`manifest icon ${i.src} doesn't exist`);
} catch (e) {
  problems.push(`manifest.json: ${e.message}`);
}

if (problems.length) {
  problems.forEach((p) => console.error(`FAIL ${p}`));
  process.exit(1);
}
console.log(
  `${jsx.length} .jsx files compile; index.html, sw.js and manifest.json agree`,
);
