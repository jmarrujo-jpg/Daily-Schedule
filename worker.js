/**
 * Daily Line Production — Cloudflare Worker (BACKEND)
 * ------------------------------------------------------------------------------------------
 * Front end is on GitHub Pages; this Worker is the shared store. Each day's board is one JSON
 * document keyed "board:YYYY-MM-DD", kept in a Cloudflare KV namespace bound as BOARDS. The
 * browser POSTs {fn, args} here; the shop-floor TV and the office editor read/write the same
 * board so both screens stay in sync.
 *
 * Self-contained: paste this whole file into a dashboard Worker (Create Worker > Edit code),
 * or deploy with wrangler. You MUST bind a KV namespace as BOARDS (see HOSTING.md / wrangler.toml).
 *
 * Optional variables (Settings > Variables and Secrets):
 *   ALLOWED_ORIGIN  (var)     e.g. https://jmarrujo-jpg.github.io  (optional; default *)
 *   API_TOKEN       (secret)  optional shared token; if set, the client must send it
 *
 * Functions (POST {fn, args}):
 *   getBoard(key)      -> board JSON | null
 *   setBoard(key, val) -> true
 *   listBoards()       -> ["board:2026-08-20", ...]   (tooling / cleanup)
 */

// Only "board:YYYY-MM-DD" keys are accepted — keeps the namespace tidy and rejects junk writes.
const KEY_RE = /^board:\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(request, env) {
    // Echo the caller's Origin so the CORS header always matches (avoids a misconfigured
    // ALLOWED_ORIGIN silently blocking the app). If ALLOWED_ORIGIN is set to a specific origin,
    // only that origin is allowed; otherwise any origin is echoed back.
    const reqOrigin = request.headers.get('Origin') || '*';
    const allowOrigin = (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*')
      ? (env.ALLOWED_ORIGIN === reqOrigin ? reqOrigin : env.ALLOWED_ORIGIN)
      : reqOrigin;
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const json = (obj, status) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET') return json({ ok: true, service: 'daily-schedule-api', build: 'v1' }, 200);
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

    let payload;
    try { payload = JSON.parse((await request.text()) || '{}'); }
    catch (e) { return json({ ok: false, error: 'Bad request body' }, 400); }

    if (env.API_TOKEN && String(payload.secret || '') !== String(env.API_TOKEN)) {
      return json({ ok: false, error: 'Unauthorized' }, 200);
    }
    if (!env.BOARDS) {
      return json({ ok: false, error: 'KV namespace BOARDS is not bound to this Worker (see HOSTING.md).' }, 200);
    }

    try {
      const result = await handle(payload.fn, payload.args || [], env);
      return json({ ok: true, result }, 200);
    } catch (e) {
      return json({ ok: false, error: e && e.message ? e.message : String(e) }, 200);
    }
  },
};

// ---------------- dispatcher ----------------
async function handle(fn, args, env) {
  args = args || [];
  switch (fn) {
    case 'getBoard': {
      const v = await env.BOARDS.get(normKey(args[0]));
      return v ? JSON.parse(v) : null;
    }
    case 'setBoard': {
      const key = normKey(args[0]);
      const val = args[1];
      if (val === null || typeof val !== 'object') throw new Error('setBoard needs a board object');
      await env.BOARDS.put(key, JSON.stringify(val));
      return true;
    }
    case 'listBoards': {
      const list = await env.BOARDS.list({ prefix: 'board:' });
      return list.keys.map((k) => k.name);
    }
    // The people roster — one shared list of names for every day, used to fill
    // the position dropdowns. Stored under the fixed key "roster". (Later this
    // can be sourced from a Google Sheet instead of KV.)
    case 'getRoster': {
      const v = await env.BOARDS.get('roster');
      return v ? JSON.parse(v) : [];
    }
    case 'setRoster': {
      const list = args[0];
      if (!Array.isArray(list)) throw new Error('setRoster needs an array of names');
      const clean = list.map((n) => String(n == null ? '' : n).trim()).filter(Boolean).slice(0, 500);
      await env.BOARDS.put('roster', JSON.stringify(clean));
      return true;
    }
    default:
      throw new Error('Unknown function: ' + fn);
  }
}

function normKey(k) {
  k = String(k == null ? '' : k);
  if (!KEY_RE.test(k)) throw new Error('Bad board key: ' + k);
  return k;
}
