/* tests/fake-supabase.js — a small stand-in for a Supabase project, for the
   end-to-end tests. The REST calls supabase-js makes (PostgREST style) run
   on a real Postgres loaded with supabase/schema.sql, as the signed-in
   player (or anon), so row-level security, grants and the database
   functions are the real ones. Sign-in (GoTrue) is faked: any email gets a
   code, and the code is always 123456. Only what Predikt uses is covered.
   Test use only. */
const http = require("http");
const crypto = require("crypto");

const SECRET = "predikt-e2e-secret";
const CODE = "123456";
const IDENT = /^[a-z_][a-z0-9_]*$/;

const b64 = (s) => Buffer.from(s).toString("base64url");
function signJwt(payload) {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}
function readJwt(token) {
  const [h, b, s] = String(token || "").split(".");
  if (!s) return null;
  const want = crypto
    .createHmac("sha256", SECRET)
    .update(`${h}.${b}`)
    .digest("base64url");
  if (want !== s) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp * 1000 > Date.now() ? p : null;
}
const ident = (x) => {
  if (!IDENT.test(x))
    throw Object.assign(new Error(`bad identifier ${x}`), { code: "PGRST100" });
  return x;
};

function startFakeSupabase({ port, pool }) {
  const refresh = new Map(); // refresh token → user
  const sent = []; // emails a code was sent to

  const userFor = async (email) => {
    const found = await pool.query(
      "select id, email from auth.users where email = $1",
      [email],
    );
    if (found.rows[0]) return found.rows[0];
    const made = await pool.query(
      "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id, email",
      [email],
    );
    return made.rows[0];
  };
  const gotrueUser = (u) => ({
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const session = (u) => {
    const now = Math.floor(Date.now() / 1000);
    const token = crypto.randomBytes(16).toString("hex");
    refresh.set(token, u);
    return {
      access_token: signJwt({
        sub: u.id,
        email: u.email,
        role: "authenticated",
        aud: "authenticated",
        iat: now,
        exp: now + 3600,
      }),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: token,
      user: gotrueUser(u),
    };
  };

  /* Run one statement as the caller, the way PostgREST does: in a
     transaction, as anon or authenticated, with the JWT's claims set. */
  const asCaller = async (claims, sql, params) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${claims ? "authenticated" : "anon"}`);
      await c.query(
        "select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
        [JSON.stringify(claims || { role: "anon" }), claims ? claims.sub : ""],
      );
      const r = await c.query(sql, params);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  };

  const where = (url, params) => {
    const out = [];
    for (const [k, v] of url.searchParams) {
      if (
        [
          "select",
          "order",
          "limit",
          "offset",
          "columns",
          "on_conflict",
        ].includes(k)
      )
        continue;
      const m = /^eq\.(.*)$/s.exec(v);
      if (!m)
        throw Object.assign(new Error(`unsupported filter ${k}=${v}`), {
          code: "PGRST100",
        });
      params.push(m[1]);
      out.push(`${ident(k)} = $${params.length}`);
    }
    return out.length ? ` where ${out.join(" and ")}` : "";
  };
  const orderBy = (url) => {
    const o = url.searchParams.get("order");
    if (!o) return "";
    return (
      " order by " +
      o
        .split(",")
        .map((part) => {
          const [col, dir = "asc", nulls] = part.split(".");
          return `${ident(col)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullsfirst" ? " nulls first" : nulls === "nullslast" ? " nulls last" : ""}`;
        })
        .join(", ")
    );
  };
  const page = (url) => {
    const lim = url.searchParams.get("limit");
    const off = url.searchParams.get("offset");
    return (
      (lim ? ` limit ${parseInt(lim, 10)}` : "") +
      (off ? ` offset ${parseInt(off, 10)}` : "")
    );
  };

  async function rest(req, url, body, claims) {
    const parts = url.pathname.replace(/^\/rest\/v1\//, "").split("/");
    if (parts[0] === "rpc") {
      const fn = ident(parts[1]);
      const args = body || {};
      const keys = Object.keys(args);
      const params = keys.map((k) => args[k]);
      const call = `public.${fn}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ")})`;
      const info = await pool.query(
        "select proretset, prorettype = 'void'::regtype as void from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace",
        [fn],
      );
      if (!info.rows[0])
        return [
          404,
          {
            code: "PGRST202",
            message: `Could not find the function public.${fn}`,
          },
        ];
      if (info.rows[0].void) {
        await asCaller(claims, `select ${call}`, params);
        return [204, null];
      }
      if (info.rows[0].proretset) {
        const r = await asCaller(
          claims,
          `select coalesce(json_agg(t), '[]'::json) as j from ${call} t`,
          params,
        );
        return [200, r.rows[0].j];
      }
      const r = await asCaller(claims, `select to_json(${call}) as j`, params);
      return [200, r.rows[0].j];
    }
    const table = ident(parts[0]);
    const prefer = String(req.headers.prefer || "");
    if (req.method === "GET") {
      const sel = (url.searchParams.get("select") || "*")
        .split(",")
        .map((c) => (c.trim() === "*" ? "*" : ident(c.trim())))
        .join(", ");
      const params = [];
      const sql = `select coalesce(json_agg(t), '[]'::json) as j from (select ${sel} from public.${table}${where(url, params)}${orderBy(url)}${page(url)}) t`;
      const r = await asCaller(claims, sql, params);
      return [200, r.rows[0].j];
    }
    if (req.method === "POST") {
      const rows = Array.isArray(body) ? body : [body];
      const cols = Object.keys(rows[0]).map(ident);
      const params = [];
      const values = rows
        .map(
          (row) =>
            `(${cols
              .map((c) => {
                params.push(row[c]);
                return `$${params.length}`;
              })
              .join(", ")})`,
        )
        .join(", ");
      const back = /return=representation/.test(prefer);
      const sql = `insert into public.${table} (${cols.join(", ")}) values ${values}${back ? " returning *" : ""}`;
      const r = await asCaller(
        claims,
        back
          ? `with ins as (${sql}) select coalesce(json_agg(ins), '[]'::json) as j from ins`
          : sql,
        params,
      );
      return back ? [201, r.rows[0].j] : [201, null];
    }
    if (req.method === "PATCH") {
      const cols = Object.keys(body).map(ident);
      const params = cols.map((c) => body[c]);
      const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
      await asCaller(
        claims,
        `update public.${table} set ${sets}${where(url, params)}`,
        params,
      );
      return [204, null];
    }
    return [405, { message: "method not supported here" }];
  }

  async function auth(req, url, body, bearer) {
    const path = url.pathname.replace(/^\/auth\/v1/, "");
    if (path === "/otp" && req.method === "POST") {
      sent.push(body.email);
      return [200, {}];
    }
    if (path === "/verify" && req.method === "POST") {
      if (String(body.token) !== CODE)
        return [
          403,
          {
            code: 403,
            error_code: "otp_expired",
            msg: "Token has expired or is invalid",
          },
        ];
      return [200, session(await userFor(String(body.email).toLowerCase()))];
    }
    if (
      path === "/token" &&
      url.searchParams.get("grant_type") === "refresh_token"
    ) {
      const u = refresh.get(body.refresh_token);
      if (!u)
        return [
          400,
          {
            code: 400,
            error_code: "refresh_token_not_found",
            msg: "Invalid Refresh Token",
          },
        ];
      refresh.delete(body.refresh_token);
      return [200, session(u)];
    }
    if (path === "/user" && req.method === "GET") {
      const c = readJwt(bearer);
      if (!c)
        return [401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" }];
      return [200, gotrueUser({ id: c.sub, email: c.email })];
    }
    if (path === "/logout") return [204, null];
    return [404, { code: 404, msg: `not faked: ${req.method} ${path}` }];
  }

  const server = http.createServer(async (req, res) => {
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers":
        req.headers["access-control-request-headers"] || "*",
      "access-control-expose-headers": "content-range",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, `http://localhost:${port}`);
    const bearer = String(req.headers.authorization || "").replace(
      /^Bearer\s+/i,
      "",
    );
    let status, out;
    try {
      const body = raw ? JSON.parse(raw) : null;
      if (url.pathname.startsWith("/auth/v1/"))
        [status, out] = await auth(req, url, body || {}, bearer);
      else if (url.pathname.startsWith("/rest/v1/"))
        [status, out] = await rest(req, url, body, readJwt(bearer));
      else [status, out] = [404, { message: "not found" }];
    } catch (e) {
      const claims = readJwt(bearer);
      status =
        e.code === "42501"
          ? claims
            ? 403
            : 401
          : e.code === "23505"
            ? 409
            : 400;
      out = {
        code: e.code || "PGRST000",
        message: e.message,
        details: e.detail || null,
        hint: e.hint || null,
      };
    }
    const headers = { ...cors };
    if (out != null) headers["content-type"] = "application/json";
    if (Array.isArray(out))
      headers["content-range"] = `0-${Math.max(0, out.length - 1)}/*`;
    res.writeHead(status, headers);
    res.end(out == null ? "" : JSON.stringify(out));
  });

  return new Promise((resolve) =>
    server.listen(port, () =>
      resolve({ server, sent, url: `http://localhost:${port}` }),
    ),
  );
}

module.exports = { startFakeSupabase, CODE };
