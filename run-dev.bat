@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 goto :error
)

echo Starting RedGod-Porn-Engine (dev)...
call npm run dev
if errorlevel 1 goto :error

goto :eof

:error
echo.
echo Something failed - see the output above.
pause
