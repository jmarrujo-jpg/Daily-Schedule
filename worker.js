/**
 * Daily Line Schedule — Cloudflare Worker (BACKEND)
 * ------------------------------------------------------------------------------------------
 * Front end is on GitHub Pages; this Worker is the store. It reads/writes a Google Sheet
 * directly with a service account (no Apps Script). The browser POSTs {fn, args} here.
 *
 * Two tabs are used (auto-created on first run if missing):
 *   Roster  — the dropdown data. Column A = names, one per row (header "Name" in A1).
 *             Edit it in the sheet and the app picks the names up.
 *   Boards  — the saved day, one row per date:
 *               A Date | B Lines Running | C Change-Overs | D Absent | E Vacation |
 *               F Updated | G Board JSON
 *             B–E are human-readable history; G is the full board so the app reloads a day exactly.
 *
 * Set these on the Worker (Settings > Variables and Secrets):
 *   GCP_SA_EMAIL        (secret)  service account email (client_email in the key JSON)
 *   GCP_SA_PRIVATE_KEY  (secret)  the private_key from the key JSON (PEM; literal \n is fine)
 *   SHEET_ID            (var)     spreadsheet id (optional; defaults to the schedule workbook)
 *   ALLOWED_ORIGIN      (var)     e.g. https://jmarrujo-jpg.github.io  (optional; default *)
 *   API_TOKEN           (secret)  optional shared token; if set, the client must send it
 *
 * Contract (POST {fn, args}):
 *   getRoster()          -> ["A. Cruz", ...]
 *   setRoster([names])   -> true
 *   getBoard(key)        -> board JSON | null      (key is "board:YYYY-MM-DD" or the date)
 *   setBoard(key, board) -> true
 *   listBoards()         -> ["2026-08-20", ...]
 */

// The schedule workbook — used when the SHEET_ID variable isn't set.
const DEFAULT_SHEET_ID = '1rlfSNCsAdKroo-ZfalsLXWm3xVSiqd5DoAXtQuTBriI';

const ROSTER_TAB = 'Roster';
const BOARDS_TAB = 'Boards';
const BOARDS_HEADER = ['Date', 'Lines Running', 'Change-Overs', 'Absent', 'Vacation', 'Updated', 'Board JSON'];

export default {
  async fetch(request, env) {
    // Echo the caller's Origin so the CORS header always matches (a specific ALLOWED_ORIGIN,
    // if set, is enforced; otherwise any origin is echoed back).
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
    if (request.method === 'GET') return json({ ok: true, service: 'daily-schedule-api', build: 'v2-sheets' }, 200);
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

    let payload;
    try { payload = JSON.parse((await request.text()) || '{}'); }
    catch (e) { return json({ ok: false, error: 'Bad request body' }, 400); }

    if (env.API_TOKEN && String(payload.secret || '') !== String(env.API_TOKEN)) {
      return json({ ok: false, error: 'Unauthorized' }, 200);
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
  const sheets = await makeSheets(env);
  await ensureSetup(sheets);
  args = args || [];
  switch (fn) {
    case 'getRoster': return getRoster(sheets);
    case 'setRoster': return setRoster(sheets, args[0]);
    case 'getBoard':  return getBoard(sheets, args[0]);
    case 'setBoard':  return setBoard(sheets, args[0], args[1]);
    case 'listBoards': {
      const rows = await sheets.values(BOARDS_TAB + '!A2:A100000');
      return rows.map((r) => String(r[0] || '')).filter(Boolean);
    }
    default:
      throw new Error('Unknown function: ' + fn);
  }
}

// ---------------- backend functions ----------------
async function getRoster(sheets) {
  const rows = await sheets.values(ROSTER_TAB + '!A2:A100000');
  return rows.map((r) => String(r[0] || '').trim()).filter(Boolean);
}

async function setRoster(sheets, list) {
  const clean = (Array.isArray(list) ? list : []).map((n) => String(n == null ? '' : n).trim()).filter(Boolean).slice(0, 2000);
  await sheets.clear(ROSTER_TAB + '!A2:A100000');
  if (clean.length) await sheets.update(ROSTER_TAB + '!A2', clean.map((n) => [n]));
  return true;
}

async function getBoard(sheets, key) {
  const date = dateFromKey(key);
  const rows = await sheets.values(BOARDS_TAB + '!A2:G100000');
  const found = rows.find((r) => String(r[0] || '') === date);
  if (!found) return null;
  const raw = found[6];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function setBoard(sheets, key, board) {
  const date = dateFromKey(key);
  if (board === null || typeof board !== 'object') throw new Error('setBoard needs a board object');
  const s = summarize(board);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const row = [date, s.lines, s.co, s.absent, s.vacation, now, JSON.stringify(board)];
  // find the day's row (col A) and upsert
  const col = await sheets.values(BOARDS_TAB + '!A2:A100000');
  const idx = col.findIndex((r) => String(r[0] || '') === date);
  if (idx < 0) await sheets.append(BOARDS_TAB, row);
  else await sheets.update(BOARDS_TAB + '!A' + (idx + 2) + ':G' + (idx + 2), [row]);
  return true;
}

// Human-readable summary columns derived from the board (for scanning history in the sheet).
function summarize(b) {
  const lines = (b.lines || []).filter((l) => l.size).map((l) => {
    const custs = (l.jobs || []).map((j) => j.cust).filter(Boolean).join('/');
    return 'L' + l.lineNo + ' ' + l.size + (custs ? ' ' + custs : '');
  }).join('; ');
  const co = (b.lines || []).filter((l) => l.status === 'co').map((l) => 'L' + l.lineNo).join(', ');
  const s = b.staff || {};
  const asList = (v) => Array.isArray(v)
    ? v.map((x) => String(x || '').trim()).filter(Boolean).join(', ')
    : String(v || '').split('\n').map((x) => x.trim()).filter(Boolean).join(', ');
  return { lines, co, absent: asList(s.absent), vacation: asList(s.vacation) };
}

function dateFromKey(k) {
  const m = String(k == null ? '' : k).match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) throw new Error('Bad board key: ' + k);
  return m[1];
}

// ---------------- ensure the two tabs exist ----------------
let setupDone = false;
async function ensureSetup(sheets) {
  if (setupDone) return;
  const meta = await sheets.meta();
  const titles = (meta.sheets || []).map((s) => s.properties && s.properties.title);
  const toAdd = [];
  if (!titles.includes(ROSTER_TAB)) toAdd.push(ROSTER_TAB);
  if (!titles.includes(BOARDS_TAB)) toAdd.push(BOARDS_TAB);
  if (toAdd.length) {
    await sheets.addTabs(toAdd);
    if (toAdd.includes(ROSTER_TAB)) await sheets.update(ROSTER_TAB + '!A1', [['Name']]);
    if (toAdd.includes(BOARDS_TAB)) await sheets.update(BOARDS_TAB + '!A1:G1', [BOARDS_HEADER]);
  }
  setupDone = true;
}

// ---------------- Google auth + Sheets ----------------
let cachedToken = null;

function b64urlBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlStr(str) { return b64urlBytes(new TextEncoder().encode(str)); }
function pemToPkcs8(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}
async function mintToken(env) {
  const email = env.GCP_SA_EMAIL;
  const key = (env.GCP_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Service account not configured (GCP_SA_EMAIL / GCP_SA_PRIVATE_KEY).');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const unsigned = b64urlStr(JSON.stringify(header)) + '.' + b64urlStr(JSON.stringify(claim));
  const ck = await crypto.subtle.importKey('pkcs8', pemToPkcs8(key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', ck, new TextEncoder().encode(unsigned));
  const jwt = unsigned + '.' + b64urlBytes(new Uint8Array(sig));
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt),
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) throw new Error('Token exchange failed: ' + (data.error_description || data.error || resp.status));
  return { token: data.access_token, exp: now + (data.expires_in || 3600) };
}
async function getToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  cachedToken = await mintToken(env);
  return cachedToken.token;
}
async function makeSheets(env) {
  const token = await getToken(env);
  const id = env.SHEET_ID || DEFAULT_SHEET_ID;
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + id;
  const auth = { Authorization: 'Bearer ' + token };
  async function call(url, opts) {
    const r = await fetch(url, opts);
    const t = await r.text();
    let j; try { j = t ? JSON.parse(t) : {}; } catch (e) { throw new Error('Sheets API non-JSON: ' + t.slice(0, 200)); }
    if (!r.ok) throw new Error('Sheets API ' + r.status + ': ' + (j.error && j.error.message ? j.error.message : t.slice(0, 200)));
    return j;
  }
  return {
    id,
    async meta() { return call(base + '?fields=sheets.properties.title', { headers: auth }); },
    async values(range) {
      const j = await call(base + '/values/' + encodeURIComponent(range), { headers: auth });
      return j.values || [];
    },
    async update(range, values) {
      return call(base + '/values/' + encodeURIComponent(range) + '?valueInputOption=RAW',
        { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });
    },
    async append(tab, row) {
      return call(base + '/values/' + encodeURIComponent(tab + '!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
        { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [row] }) });
    },
    async clear(range) {
      return call(base + '/values/' + encodeURIComponent(range) + ':clear', { method: 'POST', headers: auth });
    },
    async addTabs(names) {
      const requests = names.map((t) => ({ addSheet: { properties: { title: t } } }));
      return call(base + ':batchUpdate', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
    },
  };
}
