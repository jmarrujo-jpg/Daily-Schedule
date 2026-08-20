# Hosting: GitHub Pages front end + Cloudflare Worker backend

```
Browser (github.io page)  ──fetch {fn,args}──▶  Cloudflare Worker  ──▶  KV namespace
   docs/index.html                                worker.js              (board:YYYY-MM-DD)
```

- **GitHub Pages** serves the UI (`docs/index.html`) — a plain `*.github.io` URL, no custom
  domain needed.
- **Cloudflare Worker** (`worker.js`) is the backend: it stores each day's board as one JSON
  document in a **Cloudflare KV** namespace (keyed `board:YYYY-MM-DD`). Self-contained — paste
  it into a dashboard Worker, no build step.
- Every screen shares one board: the shop-floor **TV** (Board view) and the office **editor**
  (Edit view) read/write the same key, so edits show up on the TV within ~12 s.

> The app also works with **no Worker at all** — leave `API_URL` blank and each browser keeps its
> own board in `localStorage`. That's fine for a single device, but the TV and the editor won't
> share data until you point them at the Worker below.

> Uses GitHub Pages, not Cloudflare Pages, for the front end.

---

## Step 1 — Create the Cloudflare Worker
1. Cloudflare → **Workers & Pages → Create → Create Worker** → name it e.g.
   `daily-schedule` → Deploy.
2. **Edit code** → delete the template → paste all of **`worker.js`** → **Deploy**.

## Step 2 — Give it a KV namespace (this is the board store)
1. Cloudflare → **Storage & Databases → KV → Create a namespace** → name it e.g.
   `daily-schedule-boards`.
2. Back on the Worker → **Settings → Bindings → Add → KV namespace**:
   - **Variable name:** `BOARDS`  *(must be exactly `BOARDS` — the Worker reads `env.BOARDS`)*
   - **KV namespace:** the one you just created.
3. **Deploy** again so the binding takes effect.

## Step 3 — Optional variables
Worker → **Settings → Variables and Secrets → Add** (each is optional):
- `ALLOWED_ORIGIN` (Variable) = `https://<youruser>.github.io` to lock CORS to your page
  (leave unset to allow any origin).
- `API_TOKEN` (Secret) = a long random string, if you want a shared-token gate.
- Deploy again after adding variables.

Copy the Worker URL, e.g. `https://daily-schedule.<subdomain>.workers.dev`, and test it in a
browser → `{"ok":true,"service":"daily-schedule-api","build":"v1"}`.

## Step 4 — Point the front end at the Worker
In `docs/index.html`, set near the top:
```js
var API_URL = 'https://daily-schedule.<subdomain>.workers.dev';  // your Worker URL
var API_SECRET = '';   // set only if you added API_TOKEN in Step 3
```
Commit. (Or paste me the Worker URL and I'll set it and push.)

## Step 5 — Turn on GitHub Pages
1. GitHub repo → **Settings → Pages**.
2. **Source: Deploy from a branch** → Branch `claude/daily-schedule-review-ofnigl`, Folder
   **`/docs`** → Save. *(The repo root has `Index.html` with a capital I, which Pages won't serve
   as an index — `/docs` has the correct lowercase `index.html`.)*
3. Wait ~1 min → open the `https://<youruser>.github.io/daily-schedule/` URL.

## Step 6 — Verify shared state
1. Open the page on two devices (or two tabs). Bottom-right shows the version tag (e.g. `v2`).
2. On one, switch to **Edit**, pick a can size / type a count — the save chip reads **Saved**.
3. On the other, in **Board** view, the number appears within ~12 s.
4. If the Worker is unreachable, the board shows a red **"Could not reach the board server"**
   note and the save chip turns red — nothing is silently lost.

## Troubleshooting
- Save chip stays red **"Not saved — KV namespace BOARDS is not bound"** → do Step 2 (add the
  `BOARDS` binding) and redeploy.
- Save chip **"Not saved — Unauthorized"** → `API_SECRET` in `docs/index.html` doesn't match the
  Worker's `API_TOKEN`.
- Board won't load / **CORS error** in dev-tools → `API_URL` in `docs/index.html` doesn't match
  the Worker URL, or `ALLOWED_ORIGIN` doesn't match your github.io origin (or leave it unset).
- Page 404 "provide an index.html" → Pages Source is the repo root; switch it to **`/docs`**.
- Two screens don't match → confirm both have the same `API_URL` (not one blank / one set); a
  blank `API_URL` means that device is on local-only `localStorage`.

## Security note
With a plain github.io page, the optional `API_TOKEN` lives in the page source, so it only deters
casual access. It's fine for an internal floor board; if you later want a real login gate, we can
move the page onto a Cloudflare-proxied domain and add Cloudflare Access (Google SSO).
