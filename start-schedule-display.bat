@echo off
REM ============================================================
REM  Daily Line Schedule - shop-floor display launcher
REM  Opens the schedule full-screen (kiosk) with no browser bars.
REM  Press Alt+F4 to exit kiosk mode.
REM ============================================================

REM The ?tv flag tells the app to use the clean board look (hides the toolbar
REM buttons and Board/Edit switch) — right for a display. Your editing PC should
REM open the plain URL (no ?tv) so it keeps all the controls.
set "URL=https://jmarrujo-jpg.github.io/Daily-Schedule/?tv=1"

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
