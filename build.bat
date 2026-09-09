@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 goto :error
)

echo Building RedGod-Porn-Engine (Windows)...
call npm run build
if errorlevel 1 goto :error

echo.
echo Done. Output is in the "dist" folder.
pause
goto :eof

:error
echo.
echo Build failed - see the output above.
pause
