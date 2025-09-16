@echo off
echo ====================================
echo        Vaste Unified Platform
echo ====================================
echo.

REM Kill any existing processes
echo Cleaning up any existing processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak > nul

echo Installing dependencies...
cd /d "%~dp0"

REM Install unified backend+frontend dependencies
echo Installing unified server dependencies...
cd backend
call npm install
cd ..

REM Install game server dependencies
if not exist "server\node_modules" (
    echo Installing game server dependencies...
    cd server
    call npm install
    cd ..
)

echo.
echo ====================================
echo    Building and starting...
echo ====================================

REM Build frontend
echo Building frontend...
cd backend
call npm run build
cd ..

REM Start unified server (backend first for license checking)
echo Starting unified server (backend + frontend) on port 8080...
start "Vaste Unified Server" cmd /k "cd /d %~dp0backend && npm start"

REM Wait for backend to start
echo Waiting 5 seconds for backend to start...
timeout /t 5 /nobreak > nul

REM Start game server
echo Starting game server on port 25565...
start "Vaste Game Server" cmd /k "cd /d %~dp0server && node server.js"

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