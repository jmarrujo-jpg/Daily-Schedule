# Show past Production Slips from Google Drive

When you view a **saved past day** in the app, a **📄 Production Slip** button
appears in the top bar. Clicking it opens that day's scanned **Production Slips
PDF** straight from Google Drive. The Cloudflare Worker streams the file using the
same service account it already uses — so it opens on any PC/display without
anyone signing into Google.

It finds the file by your existing folder layout and naming, so there's nothing
new to organize:

```
Metal Production                                  ← the shared root folder
  └─ Metal Production 2026                         ← per-year (auto-detected)
       └─ Metal Production Slip Scan Archive 2026  ← the archive
            └─ 26-08-24 Production Slips.pdf        ← YY-MM-DD Production Slips.pdf
```

The app converts the day (e.g. **2026-08-24**) to the **`26-08-24`** prefix and
opens the matching PDF. Because it walks the folders by name, it keeps working in
2027, 2028, … with no changes.

---

## One-time setup

### 1. Share the folder with the service account
In Google Drive, right-click the **"Metal Production"** folder → **Share** → add
your **service-account email** (the `GCP_SA_EMAIL` value, looks like
`name@project.iam.gserviceaccount.com`) as **Viewer**. Sharing the top folder
covers everything inside it.

### 2. Enable the Drive API (once per Google Cloud project)
Google Cloud Console → **APIs & Services → Enable APIs → "Google Drive API" →
Enable** (same project as the service account / Calendar API).

### 3. Set the Worker variable and redeploy
On the Cloudflare Worker → **Settings → Variables and Secrets**, add:

| Variable | Value |
|---|---|
| `DRIVE_ROOT_FOLDER_ID` | `1j2xwKeCKPG5kKCX5PK0Q8gAEK16mvX8I` |

(That ID is the "Metal Production" folder from your shared link — the part after
`/folders/` in the URL.) Then **redeploy `worker.js`** from this repo (dashboard:
paste `worker.js` and Deploy, or `wrangler deploy`). The service-account token now
also requests Drive read access — no other credential change.

---

## Using it
1. In the app, go to a **past day** that's saved (use ‹ › or the date picker).
2. If a slip PDF exists for that day, the **📄 Production Slip** button shows in
   the top bar — click it to open the scan in a new tab.
3. No slip yet for that day → the button stays hidden (and if you open the link
   directly you'll get a friendly "No production slip found" page).

## Notes & troubleshooting
- The button only appears for **days saved on the board** (per your request) and
  only when a matching PDF is actually in the archive.
- **Files must stay named `YY-MM-DD Production Slips.pdf`** (e.g.
  `26-08-24 Production Slips.pdf`). That's already how they're scanned.
- **Button never appears / opens an error page** → the folder isn't shared with
  the service account, the Drive API isn't enabled, `DRIVE_ROOT_FOLDER_ID` isn't
  set, or the Worker wasn't redeployed.
- The folder IDs are cached by the Worker after the first lookup each year, so
  normal use is a single Drive call per day viewed.
- It reads Drive **read-only** — the app can open slips but never change or delete
  anything in Drive.
