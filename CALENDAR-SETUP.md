# Pull Absent / Vacation from Google Calendar

The app can fill the **Absent** and **Vacation** lists for a day from a shared
Google Calendar, so you don't retype them. In the **Edit** screen there's a
**⤓ Pull from Calendar** button (next to "Absent, vacation & support crew"). It
reads that day's time-off events and merges the names in — your manually typed
names are kept.

It uses the **same Google service account** the app already uses for the Sheet,
so there's no new login. You just create a calendar, share it with the service
account, and tell the Worker its Calendar ID.

---

## One-time setup

### 1. Make a time-off calendar (pick a style)
**Style A — one calendar, keyword in the title (simplest):**
Create a calendar called e.g. **"Shop Time-Off"**. Add an all-day event on each
day someone is off, titling it with the person's name **and** the type:
- `John Smith - Vacation`  (or `Vacation: John Smith`, `John Smith (PTO)`)
- `Maria Lopez - Absent`   (or `Maria Lopez Sick`, `Maria Lopez - Out`)

Type is detected from the words **vacation / vac / pto / holiday** → Vacation;
**absent / sick / out / off / ncns / call out** → Absent. No keyword → treated as
Absent. The keyword is stripped, so the name lands clean.

**Style B — two calendars, name only:**
Create **"Vacation"** and **"Absent"** calendars. The event title is just the
person's name (no keyword needed) — the calendar it's on decides the type.

Tip: make the event **all-day**, and for a week off, one event spanning the days
covers each of them.

### 2. Share the calendar with the service account
In Google Calendar → hover the calendar → **⋮ → Settings and sharing** →
**Share with specific people** → add your **service-account email**
(the `GCP_SA_EMAIL` value, looks like `name@project.iam.gserviceaccount.com`) with
permission **"See all event details."**

### 3. Get the Calendar ID
Same **Settings and sharing** page → **Integrate calendar** → copy **Calendar ID**
(a personal calendar's ID looks like an email address; a secondary calendar looks
like `...@group.calendar.google.com`).

### 4. Enable the Calendar API (once per Google Cloud project)
In Google Cloud Console for the project that owns the service account:
**APIs & Services → Enable APIs → search "Google Calendar API" → Enable.**

### 5. Set the Worker variable and redeploy
On the Cloudflare Worker → **Settings → Variables and Secrets**, add ONE of:
- `CALENDAR_ID` = the calendar ID  (Style A)
- or `CALENDAR_ID_VACATION` and `CALENDAR_ID_ABSENT` = the two IDs  (Style B)

Then **redeploy the Worker** with the updated `worker.js` from this repo
(dashboard: paste `worker.js` into the editor and Deploy; or `wrangler deploy`).
The service account's token now also requests calendar read access — no other
credential change needed.

---

## Using it
1. Open the app → **Edit** → click **⤓ Pull from Calendar**.
2. It shows e.g. "Pulled 2 on vacation, 1 absent for this day," and the names
   appear in the Vacation / Absent pickers. Adjust by hand if needed; it saves
   like any other edit.

The button pulls for the **day you're viewing**, so you can prep tomorrow by
switching to that date first.

## Notes & troubleshooting
- **Names should match the roster** so they line up with the dropdowns. If a
  calendar name matches a roster name (any capitalization), the roster spelling is
  used; an unknown name is still added and kept.
- **"Calendar API 404 … check the Calendar ID and that it is shared"** → the ID is
  wrong or you didn't share the calendar with the service-account email.
- **"No calendar configured"** → the `CALENDAR_ID` variable isn't set on the
  Worker (or the Worker wasn't redeployed after adding it).
- **"Calendar needs the online backend"** → you're on a local/offline copy with no
  `API_URL`; use the live GitHub Pages site.
- Multi-day and all-day events are handled; cancelled events are ignored.
