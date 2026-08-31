/**
 * Daily Line Schedule — Cloudflare Worker (BACKEND)
 * ------------------------------------------------------------------------------------------
 * Front end is on GitHub Pages; this Worker is the store. It reads/writes a Google Sheet
 * directly with a service account (no Apps Script). The browser POSTs {fn, args} here.
 *
 * Two tabs are used (auto-created on first run if missing):
 *   Roster  — the people, one per row. Columns:
 *               A Name | B Primary Role | C Secondary Role | D Tertiary Role |
 *               E Exception 1 Line | F Exception 1 Position | G Exception 2 Line | H Exception 2 Position
 *             Edit it in the sheet and the app picks the names/roles up.
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
 *   getRoster()          -> [{name, primary, secondary, tertiary, exceptions:[{line,pos}]}, ...]
 *   setRoster([people])  -> true
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
    if (request.method === 'GET') {
      const url = new URL(request.url);
      // ?slip=YYYY-MM-DD streams that day's Production Slips PDF from Google Drive.
      if (url.searchParams.has('slip')) {
        const m = String(url.searchParams.get('slip') || '').match(/(\d{4}-\d{2}-\d{2})/);
        if (!m) return new Response('Bad date', { status: 400, headers: cors });
        try {
          const s = await streamSlip(env, m[1]);
          if (!s) return new Response(slipNotFoundHtml(m[1]), { status: 404, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' } });
          return new Response(s.body, { status: 200, headers: {
            ...cors,
            'Content-Type': s.type || 'application/pdf',
            'Content-Disposition': 'inline; filename="' + String(s.name || 'slip.pdf').replace(/[\r\n"]/g, '') + '"',
            'Cache-Control': 'private, max-age=300',
          } });
        } catch (e) {
          return new Response('Production slip error: ' + (e && e.message ? e.message : String(e)),
            { status: 500, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      }
      return json({ ok: true, service: 'daily-schedule-api', build: 'v2-sheets' }, 200);
    }
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
    case 'getTimeOff': return getTimeOff(env, args[0]);
    case 'getSlipInfo': return getSlipInfo(env, args[0]);
    default:
      throw new Error('Unknown function: ' + fn);
  }
}

// ---------------- backend functions ----------------
// Roster columns: Name | Primary | Secondary | Tertiary | Exc1 Line | Exc1 Pos | Exc2 Line | Exc2 Pos
const ROSTER_HEADER = ['Name', 'Primary Role', 'Secondary Role', 'Tertiary Role',
  'Exception 1 Line', 'Exception 1 Position', 'Exception 2 Line', 'Exception 2 Position'];

async function getRoster(sheets) {
  const rows = await sheets.values(ROSTER_TAB + '!A2:H100000');
  const out = [];
  for (const r of rows) {
    const name = String((r && r[0]) || '').trim();
    if (!name) continue;
    const exc = [];
    const e1l = String((r[4]) || '').trim(), e1p = String((r[5]) || '').trim();
    const e2l = String((r[6]) || '').trim(), e2p = String((r[7]) || '').trim();
    if (e1l || e1p) exc.push({ line: e1l, pos: e1p });
    if (e2l || e2p) exc.push({ line: e2l, pos: e2p });
    out.push({
      name,
      primary: String(r[1] || '').trim(),
      secondary: String(r[2] || '').trim(),
      tertiary: String(r[3] || '').trim(),
      exceptions: exc,
    });
  }
  return out;
}

async function setRoster(sheets, list) {
  const rows = (Array.isArray(list) ? list : []).map((p) => {
    const o = (p && typeof p === 'object') ? p : { name: p };   // tolerate a bare-string legacy entry
    const name = String(o.name == null ? '' : o.name).trim();
    if (!name || name.toLowerCase() === '[object object]') return null;
    const ex = Array.isArray(o.exceptions) ? o.exceptions : [];
    const e0 = ex[0] || {}, e1 = ex[1] || {};
    return [
      name,
      String(o.primary || '').trim(), String(o.secondary || '').trim(), String(o.tertiary || '').trim(),
      String(e0.line || '').trim(), String(e0.pos || '').trim(),
      String(e1.line || '').trim(), String(e1.pos || '').trim(),
    ];
  }).filter(Boolean).slice(0, 2000);
  // Keep the sheet self-describing.
  await sheets.update(ROSTER_TAB + '!A1', [ROSTER_HEADER]);
  // Write the data FIRST, then clear only the rows BELOW it. The old code cleared
  // before writing, so a mid-write failure wiped the whole roster.
  if (rows.length) await sheets.update(ROSTER_TAB + '!A2', rows);
  await sheets.clear(ROSTER_TAB + '!A' + (rows.length + 2) + ':H100000');
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

// ---------------- Google Calendar: time-off (Absent / Vacation) ----------------
// Configure ONE of these on the Worker (Settings > Variables and Secrets):
//   CALENDAR_ID           one calendar; event titles say the type (see classifyTimeOff)
//   CALENDAR_ID_VACATION  a calendar where every event = someone on vacation (title = name)
//   CALENDAR_ID_ABSENT    a calendar where every event = someone absent    (title = name)
// Share the calendar(s) with the service-account email (GCP_SA_EMAIL) as "See all event
// details". A calendar's ID is in Google Calendar > Settings > that calendar > "Integrate
// calendar" > Calendar ID (personal calendars look like an email address).
async function getTimeOff(env, key) {
  const date = dateFromKey(key);
  const single = String(env.CALENDAR_ID || '').trim();
  const vacCal = String(env.CALENDAR_ID_VACATION || '').trim();
  const absCal = String(env.CALENDAR_ID_ABSENT || '').trim();
  if (!single && !vacCal && !absCal) {
    throw new Error('No calendar configured — set CALENDAR_ID (or CALENDAR_ID_VACATION / CALENDAR_ID_ABSENT) on the Worker.');
  }
  const token = await getToken(env);
  const vacation = [], absent = [];
  const pushUniq = (arr, name) => {
    const n = String(name || '').trim();
    if (n && !arr.some((x) => x.toLowerCase() === n.toLowerCase())) arr.push(n);
  };
  if (vacCal) (await calEventsForDate(token, vacCal, date)).forEach((e) => pushUniq(vacation, e.summary));
  if (absCal) (await calEventsForDate(token, absCal, date)).forEach((e) => pushUniq(absent, e.summary));
  if (single) {
    (await calEventsForDate(token, single, date)).forEach((e) => {
      const c = classifyTimeOff(e.summary);
      if (c.type === 'vacation') pushUniq(vacation, c.name); else pushUniq(absent, c.name);
    });
  }
  return { vacation, absent };
}

function addDaysUTC(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// True if the event covers `date` (YYYY-MM-DD). All-day events use start.date/end.date
// (end is exclusive); timed events use the date part of start/end dateTime.
function eventCoversDate(e, date) {
  if (e.status === 'cancelled') return false;
  const s = e.start || {}, en = e.end || {};
  if (s.date) {
    const start = s.date;
    const end = en.date || addDaysUTC(start, 1);
    return date >= start && date < end;
  }
  if (s.dateTime) {
    const start = s.dateTime.slice(0, 10);
    const end = (en.dateTime || s.dateTime).slice(0, 10);
    return date >= start && date <= end;
  }
  return false;
}

async function calEventsForDate(token, calId, date) {
  const url = 'https://www.googleapis.com/calendar/v3/calendars/'
    + encodeURIComponent(calId) + '/events'
    + '?singleEvents=true&orderBy=startTime&maxResults=250'
    + '&timeMin=' + encodeURIComponent(addDaysUTC(date, -1) + 'T00:00:00Z')
    + '&timeMax=' + encodeURIComponent(addDaysUTC(date, 2) + 'T00:00:00Z');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch (e) { throw new Error('Calendar API non-JSON: ' + t.slice(0, 200)); }
  if (!r.ok) {
    const msg = j.error && j.error.message ? j.error.message : t.slice(0, 200);
    throw new Error('Calendar API ' + r.status + ' for "' + calId + '": ' + msg
      + (r.status === 404 ? ' (check the Calendar ID and that it is shared with ' + '' + 'the service account)' : ''));
  }
  return (j.items || []).filter((e) => eventCoversDate(e, date));
}

// Decide Vacation vs Absent from an event title, and strip the keyword to leave the name.
// Examples: "John Smith - Vacation", "Vacation: John Smith", "Maria (PTO)", "Sam Sick".
// No keyword found → treated as Absent, whole title used as the name.
const TIMEOFF_KEYWORDS = /\b(vacation|vac|pto|holiday|absent|absence|sick|out|off|ncns|no ?call|call ?out)\b/ig;
function classifyTimeOff(title) {
  const raw = String(title || '').trim();
  const low = raw.toLowerCase();
  const isVac = /\b(vacation|vac|pto|holiday)\b/.test(low);
  let name = raw.replace(TIMEOFF_KEYWORDS, ' ').replace(/[\-:|()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) name = raw; // title was only a keyword
  return { type: isVac ? 'vacation' : 'absent', name };
}

// ---------------- Google Drive: production slip PDFs ----------------
// Folder layout (names, not IDs, so it works year to year):
//   <DRIVE_ROOT_FOLDER_ID = "Metal Production">
//     └─ "Metal Production <YEAR>"
//          └─ "Metal Production Slip Scan Archive <YEAR>"
//               └─ "YY-MM-DD Production Slips.pdf"
// Set DRIVE_ROOT_FOLDER_ID on the Worker to the shared root folder's ID, and share
// that folder with the service-account email (GCP_SA_EMAIL) as a Viewer.
async function driveList(token, q, fields) {
  const url = 'https://www.googleapis.com/drive/v3/files'
    + '?q=' + encodeURIComponent(q)
    + '&fields=' + encodeURIComponent(fields || 'files(id,name,mimeType)')
    + '&pageSize=100&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true';
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch (e) { throw new Error('Drive API non-JSON: ' + t.slice(0, 200)); }
  if (!r.ok) throw new Error('Drive API ' + r.status + ': ' + (j.error && j.error.message ? j.error.message : t.slice(0, 150)));
  return j.files || [];
}

// Resolve the archive folder (cached per year) and find the file for a date.
// Returns {id,name,mimeType} or null.
const archiveFolderByYear = {};
async function findSlipFile(env, date) {
  const root = String(env.DRIVE_ROOT_FOLDER_ID || '').trim();
  if (!root) throw new Error('Drive not configured — set DRIVE_ROOT_FOLDER_ID on the Worker to the "Metal Production" folder ID.');
  const token = await getToken(env);
  const [Y, M, D] = date.split('-');
  const prefix = Y.slice(2) + '-' + M + '-' + D; // 2026-08-24 -> 26-08-24

  let archiveId = archiveFolderByYear[Y];
  if (!archiveId) {
    const FOLDER = "mimeType='application/vnd.google-apps.folder'";
    // Year container folder (e.g. "Metal Production 2026") — the one that is NOT the archive.
    const yearFolders = await driveList(token, `'${root}' in parents and ${FOLDER} and name contains '${Y}' and trashed=false`);
    const yearFolder = yearFolders.find((f) => !/archive/i.test(f.name)) || yearFolders[0];
    if (!yearFolder) throw new Error('No "' + Y + '" folder inside the Metal Production folder.');
    // Archive folder inside the year folder (e.g. "Metal Production Slip Scan Archive 2026").
    const archives = await driveList(token, `'${yearFolder.id}' in parents and ${FOLDER} and name contains 'Archive' and trashed=false`);
    const archive = archives.find((f) => /slip/i.test(f.name)) || archives[0];
    if (!archive) throw new Error('No "Slip Scan Archive" folder inside "' + yearFolder.name + '".');
    archiveId = archive.id;
    archiveFolderByYear[Y] = archiveId;
  }
  // The slip file for the date. NOTE: Drive's `name contains` is a loose, token-based
  // match (it splits on the dashes), so the query can return many unrelated files.
  // We therefore ONLY accept a file whose name actually BEGINS with "YY-MM-DD"
  // followed by a separator — never a fallback to some other file — so a missing
  // date returns null ("no slip") instead of the wrong day's slip.
  const files = await driveList(token, `'${archiveId}' in parents and name contains '${prefix}' and trashed=false`);
  const hit = files.find((f) => {
    const n = String(f.name || '');
    if (n.indexOf(prefix) !== 0) return false;         // must start with the exact date
    const after = n.charAt(prefix.length);
    return after === '' || after === ' ' || after === '.' || after === '_' || after === '-';
  });
  return hit || null;
}

// Lightweight existence check for the UI: { found, name }.
async function getSlipInfo(env, key) {
  const date = dateFromKey(key);
  const file = await findSlipFile(env, date);
  return { found: !!file, name: file ? file.name : '' };
}

// Fetch the file bytes for streaming back to the browser.
async function streamSlip(env, date) {
  const file = await findSlipFile(env, date);
  if (!file) return null;
  const token = await getToken(env);
  const r = await fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media&supportsAllDrives=true',
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) { const t = await r.text(); throw new Error('Drive download ' + r.status + ': ' + t.slice(0, 150)); }
  return { body: r.body, type: file.mimeType || 'application/pdf', name: file.name };
}

function slipNotFoundHtml(date) {
  return '<!doctype html><meta charset="utf-8"><title>No slip</title>'
    + '<body style="font-family:system-ui,Arial;background:#0d1117;color:#eef3f8;display:flex;'
    + 'align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">'
    + '<div><div style="font-size:42px">📄</div>'
    + '<h2>No production slip found for ' + date + '</h2>'
    + '<p style="color:#8593a0">Nothing named "' + date.slice(2) + ' Production Slips" is in the archive folder yet.</p></div></body>';
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
    if (toAdd.includes(ROSTER_TAB)) await sheets.update(ROSTER_TAB + '!A1', [ROSTER_HEADER]);
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
  const claim = { iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
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
