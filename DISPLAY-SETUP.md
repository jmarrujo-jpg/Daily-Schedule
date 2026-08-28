# Setting up the shop-floor display PC

Goal: the first person in each morning **presses the PC's power button**, and the
Daily Line Schedule comes up full-screen on its own with nobody typing a
password. At **2:30 PM** the PC **shuts itself off** for the day.

(No sleep, no wake timers, no BIOS alarm — the PC is simply OFF overnight and a
person turns it back on. This sidesteps the "won't wake up" problem some PCs have
with sleep/wake timers.)

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

### 2. Keep the screen awake while it's on
- **Settings → System → Power** → set **Screen** to **Never** turn off (so it
  stays lit through the shift).
- Set **Sleep** to **Never** — the PC doesn't sleep; it shuts down at 2:30 PM
  (step 4) and someone powers it on in the morning.

### 3. Open the schedule full-screen when the PC is turned on
The person opening the shop just presses the power button. Windows auto-signs-in
(step 1) and this makes the schedule open by itself:
1. Copy **`start-schedule-display.bat`** (in this repo) somewhere on the PC, e.g.
   `C:\schedule\start-schedule-display.bat`.
2. Press **Windows + R**, type **`shell:startup`**, press Enter.
3. Put a **shortcut** to `start-schedule-display.bat` in that folder (right-drag
   the `.bat` in → **Create shortcuts here**).
4. That's it — every time the PC signs in (i.e. every morning when it's turned
   on), the schedule opens full-screen automatically.

Test: reboot the PC. After it signs itself in, the schedule should fill the
screen. (Only **one** launcher in Startup — if you also have a Chrome/Edge
shortcut there, delete it, or the app opens twice.)

### 4. Shut down at 2:30 PM (weekdays)
1. Copy **`shutdown-display-pc.bat`** (in this repo) to the PC, e.g.
   `C:\schedule\shutdown-display-pc.bat`.
2. **Task Scheduler → Create Basic Task** → name `Schedule Display - Shutdown`.
3. Trigger: choose **Weekly** → tick **Mon, Tue, Wed, Thu, Fri** → time **2:30 PM**.
4. Action: **Start a program** → browse to `shutdown-display-pc.bat`.
5. Finish. Then double-click the task → **Properties → Conditions** tab and
   **uncheck** "Start the task only if the computer is on AC power" (so it still
   shuts down on any machine).
6. Test: right-click the task → **Run**. The PC should close the browser and
   power off within a few seconds.

Net effect: **someone turns it on in the morning → schedule appears on its own →
it shuts off at 2:30 PM, Mon–Fri.** Over the weekend it simply stays off. The
schedule app also **skips all automatic server checks on Saturday and Sunday**,
so nothing runs until Monday.

> Prefer sleep-and-auto-wake instead of a daily power-on? That's what
> `sleep-display-pc.bat` was for, but it depends on Windows wake timers / BIOS
> "Wake on RTC," which many PCs don't honor reliably (the "won't wake up"
> problem). The shutdown approach above avoids all of that.

### Exiting the full-screen display
Press **Alt + F4** (or **Ctrl + W**) to leave kiosk mode and get the normal
desktop back.

---

## Mac setup (if the display is a Mac)
- **Auto login:** System Settings → Users & Groups → **Automatically log in as**
  → pick the account (keeps the password, skips the prompt).
- **Open on login (when it's turned on):** add a **Login Item** (System Settings →
  General → Login Items) that opens
  `https://jmarrujo-jpg.github.io/Daily-Schedule/?tv=1` in Chrome, or launch Chrome
  with `--kiosk`, then press **Ctrl+Cmd+F** for full screen.
- **Shut down at 2:30 PM:** System Settings → (search) **Schedule** / Energy Saver
  → set a daily **Sleep/Shut Down** schedule to **Shut Down** at 2:30 PM. Someone
  powers it on in the morning.

---

## Notes
- Once open, the app runs itself: it auto-refreshes on your schedule
  (20 s from 5-7 AM, every 5 min until 2:30 PM, then quiet) and has a
  **⟳ Refresh** button to pull the latest instantly any time.
- Make sure the display PC's **clock and time zone** are correct - the app's
  auto-refresh windows and the 2:30 PM shutdown both use the PC's local time.
- The app also has a **⛶ TV** button for full-screen if you ever open it in a
  normal browser window instead of kiosk mode.
