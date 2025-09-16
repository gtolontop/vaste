@echo off
echo Starting Vaste...
echo.

echo Installing dependencies if needed...
cd /d "%~dp0"
if not exist "server\node_modules" (
    echo Installing server dependencies...
    cd server
    call npm install
    cd ..
)

if not exist "client\node_modules" (
    echo Installing client dependencies...
    cd client
    call npm install
    cd ..
)

echo.
echo Starting server on port 25565...
start "Vaste Server" cmd /k "cd /d %~dp0server && node server.js"

echo.
echo Waiting 3 seconds for server to start...
timeout /t 3 /nobreak > nul

echo.
echo Starting client on http://localhost:3000...
start "Vaste Client" cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo Both server and client are starting!
echo Instructions:
echo   1. Wait for client to open in your browser
echo   2. Enter server URL: ws://localhost:25565
echo   3. Click Connect
echo   4. Enjoy the game!
echo.
echo Press any key to close this window...
pause > nul
