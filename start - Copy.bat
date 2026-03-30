@echo off
echo.
echo ====================================
echo    Starting...
echo ====================================

REM Start unified server (app first for license checking)
echo Starting unified server (backend + frontend) on port 8080...
start "Vaste Unified Server" cmd /k "cd /d %~dp0app && npm start"

REM Wait for app to start
echo Waiting 5 seconds for app to start...
timeout /t 5 /nobreak > nul

REM Start game server
echo Starting game server on port 25565...
start "Vaste Game Server" cmd /k "cd /d %~dp0gameserver\vaste && node server.js"

echo.
echo ====================================
echo    Vaste Platform Started!
echo ====================================
echo.
echo Web App:     http://localhost:8080
echo Game Server: ws://localhost:25565
echo.
echo Instructions:
echo   1. Open http://localhost:8080 in your browser
echo   2. Create an account or login
echo   3. Enter server URL: ws://localhost:25565
echo   4. Connect and play!
echo.
echo Press any key to close this launcher...
pause > nul