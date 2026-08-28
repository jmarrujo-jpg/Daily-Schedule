@echo off
REM ============================================================
REM  Daily Line Schedule - shut the display PC down for the day.
REM  Run this on a schedule (2:30 PM, Mon-Fri). Whoever opens the
REM  shop in the morning just presses the PC's power button and the
REM  schedule comes up on its own (Startup task opens it at login).
REM
REM  No wake timers, no sleep, no BIOS alarm needed - the PC is fully
REM  OFF overnight and a person turns it back on. This avoids the
REM  "won't wake up" problem some PCs have with sleep/wake timers.
REM ============================================================

REM Close the kiosk browser first so nothing prompts and blocks shutdown.
taskkill /IM chrome.exe /F >nul 2>&1
taskkill /IM msedge.exe /F >nul 2>&1

REM Full shutdown now (/s shut down, /f force-close apps, /t 0 no delay).
shutdown /s /f /t 0
