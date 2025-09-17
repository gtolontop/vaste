# Vaste Backend

Centralized backend for Vaste game, handling user authentication and community game server listing.

## Quick Start

### Prerequisites

- Node.js 18+ 
- MySQL 8.0+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Configure your database in .env
# Then run migrations
npm run migrate

# Start server
npm run dev
```

## Database Configuration

### MySQL

1. Create MySQL database:
```sql
CREATE DATABASE vaste_backend;
```

2. Configure .env file:
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=vaste_backend
DB_USER=your_username
DB_PASSWORD=your_password
JWT_SECRET=your-super-secure-jwt-secret
```

3. Run migrations:
```bash
npm run migrate
```

## API Endpoints

### Authentication (`/api/auth`)

#### `POST /api/auth/register`
Create new user account.

**Body:**
```json
{
  "username": "player123",
  "email": "player@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": {
      "uuid": "123e4567-e89b-12d3-a456-426614174000",
      "username": "player123",
      "email": "player@example.com",
      "created_at": "2025-01-01T00:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### `POST /api/auth/login`
User login.

**Body:**
```json
{
  "email": "player@example.com",
  "password": "SecurePass123"
}
```

#### `GET /api/auth/profile`
Get user profile (authentication required).

**Headers:**
```
Authorization: Bearer your-jwt-token
```

#### `PUT /api/auth/profile`
Update user profile.

#### `PUT /api/auth/password`
Change password.

#### `GET /api/auth/verify`
Verify token validity.

### Game Servers (`/api/servers`)

#### `GET /api/servers`
List public online servers.

**Response:**
```json
{
  "success": true,
  "data": {
    "servers": [
      {
        "uuid": "server-uuid",
        "name": "My Vaste Server",
        "description": "An awesome server!",
        "websocket_url": "ws://localhost:25565",
        "max_players": 10,
        "current_players": 3,
        "is_online": true,
        "version": "1.0.0",
        "tags": "pvp,building"
      }
    ]
  }
}
```

#### `POST /api/servers`
Create new server (authentication required).

#### `GET /api/servers/my-servers`
User's servers.

#### `PUT /api/servers/:uuid`
Update server.

#### `DELETE /api/servers/:uuid`
Delete server.

#### `POST /api/servers/:uuid/ping`
Update server status (for game servers).

## Security

- **JWT**: Token-based authentication
- **bcrypt**: Secure password hashing
- **Helmet**: HTTP security headers
- **Rate limiting**: Request rate limiting
- **Validation**: Strict input validation

## Database Structure

### Table `users`
- `id`: Primary key auto-increment
- `uuid`: Unique UUID identifier
- `username`: Unique username (3-50 characters)
- `email`: Unique email address
- `password`: bcrypt hashed password
- `profile_picture`: Avatar URL (optional)
- `is_active`: Active/inactive status
- `created_at`, `updated_at`, `last_login`: Timestamps

### Table `game_servers`
- `id`: Primary key auto-increment
- `uuid`: Unique UUID identifier
- `name`: Server name
- `description`: Description
- `host`, `port`: Server address
- `websocket_url`: WebSocket URL for connection
- `max_players`, `current_players`: Player management
- `is_online`, `is_public`: Status flags
- `owner_id`: Reference to owning user
- `version`, `tags`: Metadata
- `last_ping`: Last activity

## Game Server Integration

Community game servers can:

1. **Register** via API to appear in server list
2. **Regular ping** to maintain online status
3. **Validate tokens** of connecting players

Example integration in game server:

```javascript
// Regular ping to maintain status
setInterval(async () => {
  await fetch(`${BACKEND_URL}/api/servers/${SERVER_UUID}/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_players: connectedPlayers.length })
  });
}, 30000); // Every 30 seconds
```

## Deployment

### Production Environment Variables

```env
NODE_ENV=production
PORT=8080
DB_HOST=your-production-db-host
DB_NAME=vaste_backend
JWT_SECRET=your-very-secure-production-secret
```

### Available Scripts

- `npm start`: Production start
- `npm run dev`: Development start with nodemon
- `npm run migrate`: Run database migrations

## Future Features

- Server ranking system
- Detailed statistics
- Moderation and reporting
- Real-time WebSocket notifications API
- Admin dashboard
- Mods/plugins system
- Cross-server global chat