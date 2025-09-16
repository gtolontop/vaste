# Vaste - Multiplayer Voxel Game

A minimal multiplayer voxel game with a Node.js server and React/TypeScript client.

## Project Structure

```
/vaste
├── /server
│   ├── server.js          # Node.js WebSocket server
│   └── package.json       # Server dependencies
├── /client
│   ├── src/
│   │   ├── App.tsx        # Main React component
│   │   ├── Game.tsx       # Three.js game component
│   │   ├── network.ts     # WebSocket network manager
│   │   ├── types.ts       # TypeScript type definitions
│   │   └── main.tsx       # React entry point
│   ├── index.html
│   ├── package.json       # Client dependencies
│   ├── vite.config.ts     # Vite configuration
│   └── tsconfig.json      # TypeScript configuration
└── package.json           # Root package.json
```

## Quick Start

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install all dependencies (server + client)
npm run install:all
```

### 2. Start the Server

```bash
# Option 1: From root
npm run start:server

# Option 2: Direct
cd server
npm install
node server.js
```

The server will start on `ws://localhost:25565` by default.

### 3. Start the Client

```bash
# Option 1: From root (new terminal)
npm run start:client

# Option 2: Direct
cd client
npm install
npm run dev
```

The client will start on `http://localhost:3000`.

### 4. Connect and Play

1. Open your browser to `http://localhost:3000`
2. Enter server URL: `ws://localhost:25565`
3. Click "Connect"
4. Start playing!

## Game Features

### Server (Node.js)
- WebSocket server using `ws` library
- 16x16x16 voxel world stored in memory
- Multi-player support with unique IDs
- Real-time block breaking/placing
- Player movement synchronization
- Authority-based game state management

### Client (React + TypeScript + Three.js)
- React 18 with TypeScript
- Three.js 3D rendering with React Three Fiber
- First-person camera controls (WASD + mouse)
- WebSocket connection management
- Real-time multiplayer interaction
- Block breaking (left click) and placing (right click)
- Other players visualization
- Connection screen with server URL input

## Controls

- **WASD**: Move around
- **Mouse**: Look around (click to lock pointer)
- **Left Click**: Break blocks
- **Right Click**: Place blocks
- **ESC**: Unlock pointer

## Network Protocol

### Client → Server Messages

```json
{ "type": "player_move", "x": 2.5, "y": 1.0, "z": -4.2 }
{ "type": "break_block", "x": 1, "y": 5, "z": 3 }
{ "type": "place_block", "x": 1, "y": 5, "z": 3 }
```

### Server → Client Messages

```json
{ "type": "world_init", "playerId": "uuid", "blocks": [...], "worldSize": 16 }
{ "type": "block_update", "action": "break", "x": 1, "y": 5, "z": 3 }
{ "type": "player_update", "id": "uuid", "x": 2.5, "y": 1.0, "z": -4.2 }
{ "type": "player_disconnect", "id": "uuid" }
```

## Testing Multiplayer

1. Start the server: `npm run start:server`
2. Start the client: `npm run start:client`
3. Open multiple browser tabs/windows
4. Connect each tab to `ws://localhost:25565`
5. Test that:
   - Players see each other as blue cubes
   - Movement is synchronized in real-time
   - Block breaking/placing is visible to all players
   - Disconnecting players disappear from other clients

## Development

### Server Development
```bash
cd server
# Edit server.js
node server.js
```

### Client Development
```bash
cd client
# Edit src/ files
npm run dev
```

## Dependencies

### Server
- `ws`: WebSocket server
- `uuid`: Unique player ID generation

### Client
- `react` + `react-dom`: UI framework
- `three`: 3D graphics library
- `@react-three/fiber`: React renderer for Three.js
- `@react-three/drei`: Three.js helpers
- `vite`: Development server and build tool
- `typescript`: Type safety

## Future Enhancements

- Different block types
- Persistent world storage
- Player inventory system
- Chat system
- Player authentication
- Larger world generation
- Block physics
- Crafting system

## License

MIT License - feel free to modify and distribute!
