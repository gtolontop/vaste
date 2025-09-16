# Vaste

A multiplayer voxel game built with React and Node.js. Create an account, connect to servers, and build together in real-time.

## How to Run

### Requirements
- Node.js 18+
- MySQL 8.0+

### Setup
1. Create a MySQL database called `vaste_backend`
2. Create a `.env` file in `/backend`:
```
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=vaste_backend
JWT_SECRET=your_secret_key
```

### Launch
Run the startup script:
```bash
./start.bat
```

Then open **http://localhost:8080** and play!

## Architecture
- `/backend` - Unified Express.js server + React frontend (port 8080)
- `/server` - Game server (WebSocket, port 25565)
