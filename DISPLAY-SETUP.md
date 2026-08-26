# Setting up the shop-floor display PC

Goal: at **5:00 AM** the screen shows the Daily Line Schedule full-screen, on its
own, with nobody typing a password.

**You do NOT need to remove the account password.** Removing it is a security
risk and doesn't help. Instead, turn on **automatic sign-in** for this one PC, so
Windows logs itself in and lands on the desktop with no prompt.

The display URL (note the **`?tv=1`** — it gives the clean board look, hiding the
toolbar buttons and the Board/Edit switch on the display):
**https://jmarrujo-jpg.github.io/Daily-Schedule/?tv=1**

Your own editing PC should open the **plain** URL (no `?tv=1`) so it keeps all the
buttons: **https://jmarrujo-jpg.github.io/Daily-Schedule/**

---

## Windows setup (typical shop PC)

### 1. Turn on automatic sign-in (keeps the password, just skips the prompt)
1. If on Windows 11: **Settings → Accounts → Sign-in options** → turn **OFF**
   "For improved security, only allow Windows Hello sign-in for Microsoft
   accounts." (If this is left on, the next step won't show the checkbox.)
2. Press **Windows key + R**, type **`netplwiz`**, press Enter.
3. Click your user account in the list, then **uncheck** "Users must enter a user
   name and password to use this computer." Click **Apply**.
4. Type the account password twice when prompted. Click **OK**.

Now the PC boots straight to the desktop — no password typed — but the account
still HAS a password (so remote/other access stays protected).

### 2. Keep the screen awake during the day
- **Settings → System → Power** → set **Screen** to **Never** turn off (or set a
  night-time turn-off if you want the panel to rest after hours).
- Set **Sleep** to **Never** while it's the display PC.

### 3. Make it open the schedule full-screen at 5 AM
Two easy options — pick one.

**Option A - Task Scheduler (recommended, exact 5 AM start)**
1. Copy **`start-schedule-display.bat`** (in this repo) somewhere on the PC, e.g.
   `C:\schedule\start-schedule-display.bat`.
2. Open **Task Scheduler** → **Create Basic Task**.
3. Name: `Schedule Display` → **Daily** → start time **5:00 AM**.
4. Action: **Start a program** → browse to the `.bat` file.
5. Finish. Then double-click the task → **Properties**:
   - General tab: check **Run whether user is logged on or not** is *unchecked*
     (leave it running as the logged-in user so the screen shows it).
   - Conditions tab: check **Wake the computer to run this task** (so it starts
     even if the PC dozed off).
6. Test it: right-click the task → **Run**. The schedule should fill the screen.

**Option B - Startup folder (opens at every login)**
1. Press **Windows + R**, type **`shell:startup`**, press Enter.
2. Put a shortcut to `start-schedule-display.bat` in that folder.
3. Now whenever the PC signs in (including the 5 AM auto sign-in after a nightly
   restart), the schedule opens automatically.

### 3b. Weekday-only (skip weekends)
If the shop is closed weekends, make the display tasks run **Mon-Fri** only:
- When you create the 5 AM task, choose **Weekly** instead of Daily and tick
  **Mon, Tue, Wed, Thu, Fri**. (For a task already made as Daily, open its
  **Triggers** tab → edit the trigger → **Weekly → Mon-Fri**.)
- The schedule app itself also **skips all automatic server checks on Saturday
  and Sunday** now, so even if a display is left on over the weekend it stays
  quiet until Monday. The **⟳ Refresh** button still works any time.

### 4. Rest the screen at night (save the panel + power)
Put the PC to sleep after the shift; the 5 AM task wakes it back up.
1. Copy **`sleep-display-pc.bat`** (in this repo) to the PC, e.g.
   `C:\schedule\sleep-display-pc.bat`.
2. **Task Scheduler → Create Basic Task** → name `Schedule Display - Sleep` →
   **Weekly → Mon-Fri** → time e.g. **3:00 PM** → **Start a program** → point at
   the `.bat`.
3. Make sure sleep can actually happen and wake works:
   - **Settings → System → Power** → allow the PC to **Sleep** (don't set it to
     Never if you use this task).
   - **Control Panel → Power Options → Change plan settings → Change advanced
     power settings → Sleep → Allow wake timers → Enable.** (This lets the 5 AM
     "Schedule Display" task wake the PC.)
4. Confirm the **5 AM task's Conditions tab** has **"Wake the computer to run this
   task"** checked (from step 3, Option A).

Net effect: **sleeps ~3 PM, wakes and shows the board at 5 AM, weekdays only.**
Prefer a full shutdown instead of sleep? Edit `sleep-display-pc.bat` (it explains
the one-line change) and enable **Wake on RTC** in the BIOS (see below).

### 5. (Optional) Power on by itself at 5 AM
If you shut the PC down at night, have it power itself back on:
- Enter the PC's **BIOS/UEFI** (tap Del or F2 at boot) → look for
  **Power Management → Wake on RTC / Resume by Alarm / Auto Power On** → set daily
  at ~4:55 AM.
- Simplest alternative: just **leave the PC on 24/7** and let the screen sleep at
  night. The schedule app already stops calling the server after 2:30 PM, so an
  idle display costs almost nothing.

### Exiting the full-screen display
Press **Alt + F4** (or **Ctrl + W**) to leave kiosk mode and get the normal
desktop back.

---

## Mac setup (if the display is a Mac)
- **Auto login:** System Settings → Users & Groups → **Automatically log in as**
  → pick the account (keeps the password, skips the prompt).
- **Open at 5 AM:** use the **Calendar + Automator** or a `launchd` job / a simple
  Shortcuts automation that opens
  `https://jmarrujo-jpg.github.io/Daily-Schedule/` in Chrome, then press
  **Ctrl+Cmd+F** for full screen (or launch Chrome with `--kiosk`).
- **Prevent sleep:** System Settings → Displays / Battery → set the display to
  never sleep during the day.

---

## Notes
- Once open, the app runs itself: it auto-refreshes on your schedule
  (20 s from 5-7 AM, every 5 min until 2:30 PM, then quiet) and has a
  **⟳ Refresh** button to pull the latest instantly any time.
- Make sure the display PC's **clock and time zone** are correct - the 5 AM / 2:30
  PM schedule uses the PC's local time.
- The app also has a **⛶ TV** button for full-screen if you ever open it in a
  normal browser window instead of kiosk mode.
