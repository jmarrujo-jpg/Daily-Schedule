@echo off
REM ============================================================
REM  Daily Line Schedule - put the display PC to sleep for the night.
REM  Run this on a schedule (e.g. 3:00 PM weekdays). The 5 AM
REM  "Schedule Display" task wakes the PC back up automatically
REM  (make sure that task has "Wake the computer to run this task"
REM  checked, and that Wake Timers are allowed in Power settings).
REM
REM  Sleeping saves power AND rests the screen. If you would rather
REM  fully shut down, replace the line below with:  shutdown /s /t 0
REM  (a full shutdown needs BIOS "Wake on RTC / Resume by Alarm"
REM  to power the PC back on at 5 AM).
REM ============================================================

REM Close any open kiosk browser first so it starts clean in the morning.
taskkill /IM chrome.exe /F >nul 2>&1
taskkill /IM msedge.exe /F >nul 2>&1

REM Sleep the PC (hibernate=0, force=1, disable-wake=0 so the 5 AM task can wake it).
rundll32.exe powrprof.dll,SetSuspendState 0,1,0
