@echo off
REM ============================================================
REM  Daily Line Schedule - shop-floor display launcher
REM  Opens the schedule full-screen (kiosk) with no browser bars.
REM  Press Alt+F4 to exit kiosk mode.
REM ============================================================

set "URL=https://jmarrujo-jpg.github.io/Daily-Schedule/"

REM --- Try Google Chrome first ---
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --kiosk --app=%URL% --noerrdialogs --disable-infobars --incognito
  goto :eof
)

REM --- Fall back to Microsoft Edge (built into Windows) ---
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --kiosk %URL% --edge-kiosk-type=fullscreen --no-first-run --disable-infobars
  goto :eof
)

echo Could not find Chrome or Edge. Please install a browser.
pause
