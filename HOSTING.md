# Hosting: GitHub Pages front end + Cloudflare Worker backend + Google Sheet store

```
Browser (github.io page)  ──fetch {fn,args}──▶  Cloudflare Worker  ──▶  Google Sheet
   docs/index.html                                worker.js            (service account)
```

- **GitHub Pages** serves the UI (`docs/index.html`) — a plain `*.github.io` URL, no custom
  domain needed.
- **Cloudflare Worker** (`worker.js`) is the backend. It reads/writes a **Google Sheet** directly
  with a **service account** (no Apps Script). Self-contained — paste it into a dashboard Worker,
  no build step.
- Until `API_URL` in `docs/index.html` points at the Worker, the app still runs entirely in the
  browser's `localStorage` (single device, no sync). Point it at the Worker and every screen shares
  one live board.

## The Google Sheet
Workbook: `1rlfSNCsAdKroo-ZfalsLXWm3xVSiqd5DoAXtQuTBriI` (baked into `worker.js` as the default;
override with a `SHEET_ID` variable if it ever changes). The Worker creates two tabs automatically
on first use:

- **`Roster`** — the dropdown data. Column A is names, one per row (header `Name` in A1). Edit it
  right in the sheet and the app picks the names up (positions, Absent, Vacation dropdowns).
- **`Boards`** — the saved day, one row per date:
  `A Date | B Lines Running | C Change-Overs | D Absent | E Vacation | F Updated | G Board JSON`.
  Columns B–E are human-readable so you can scan history; column G holds the full board so the app
  reloads any day exactly.

---

## Step 1 — Service account can reach the sheet
1. In Google Cloud Console, create (or reuse) a **service account** and download its **JSON key**.
   *(You can reuse the same service account as the Inventory / Litho apps.)*
2. **Share the sheet** with the service account's email (`…@…iam.gserviceaccount.com`, the
   `client_email` in the key JSON) — give it **Editor** (the app writes days back).
3. Google Cloud Console → **APIs & Services → Library → Google Sheets API → Enable** (on the
   service account's project).

## Step 2 — Create the Cloudflare Worker
1. Cloudflare → **Workers & Pages → Create → Create Worker** → name it `daily-schedule` → Deploy.
2. **Edit code** → delete the template → paste all of **`worker.js`** → **Deploy**.
3. **Settings → Variables and Secrets → Add:**
   - `GCP_SA_EMAIL` (Secret) = the service account email.
   - `GCP_SA_PRIVATE_KEY` (Secret) = the `private_key` value from the key JSON (paste verbatim; the
     `\n`s are fine).
   - `SHEET_ID` (Variable, optional) — only if the workbook changes.
   - `ALLOWED_ORIGIN` (Variable, optional) = `https://jmarrujo-jpg.github.io` to lock CORS.
   - `API_TOKEN` (Secret, optional) = a long random string for a shared-token gate.
   - **Deploy again** after adding variables.
4. Copy the Worker URL, e.g. `https://daily-schedule.<subdomain>.workers.dev`.
5. Test: open that URL in a browser → `{"ok":true,"service":"daily-schedule-api","build":"v2-sheets"}`.

> There is **no KV namespace** anymore — the store is the Google Sheet. If you set up KV earlier you
> can delete that binding; it's unused.

## Step 3 — Point the front end at the Worker
In `docs/index.html`, near the top:
```js
var API_URL = 'https://daily-schedule.<subdomain>.workers.dev';  // your Worker URL
var API_SECRET = '';   // set only if you added API_TOKEN in Step 2
```
Commit. (Or paste me the Worker URL and I'll set it and push.)

## Step 4 — Turn on GitHub Pages
1. GitHub repo → **Settings → Pages**.
2. **Source: Deploy from a branch** → Branch `claude/daily-schedule-review-ofnigl`, Folder **`/docs`**
   → Save. *(The repo root also has `Index.html`, but Pages serves the lowercase `docs/index.html`.)*
3. Wait ~1 min → open the `https://<youruser>.github.io/daily-schedule/` URL.

## Step 5 — Verify
- In **Edit**, add a name under **People / Roster** → a new row appears in the `Roster` tab.
- Fill a line and switch days and back → the day reloads; a row for that date appears in the
  `Boards` tab with the readable summary + JSON.

## Troubleshooting
- Save chip says **"Service account not configured"** → the Worker secrets didn't save, or you
  didn't redeploy after adding them.
- **"Sheets API 403"** → the sheet isn't shared with the service account email, or the Sheets API
  isn't enabled on its project.
- **CORS error in dev-tools** → `API_URL` in `docs/index.html` doesn't match the Worker URL, or
  `ALLOWED_ORIGIN` doesn't match your github.io origin (or leave it unset to allow all).
- Page 404 "provide an index.html" → Pages Source is the repo root; switch it to **`/docs`**.

## Security note
With a plain github.io page, the optional `API_TOKEN` lives in the page source, so it only deters
casual access. Fine for an internal floor tool; for a real login gate we can move the page onto a
Cloudflare-proxied domain and add Cloudflare Access (Google SSO).
