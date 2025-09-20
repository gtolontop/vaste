import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './src/config/database.js';

// Route imports
import authRoutes from './src/routes/auth.js';
import serverRoutes from './src/routes/servers.js';
import gameServerRoutes from './src/routes/gameServers.js';

// Configuration
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware with custom CSP for WebSocket connections
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws://localhost:25565", "wss://localhost:25565", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Middleware to parse JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve client static files in production
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve client build files
app.use(express.static(path.join(__dirname, './client/dist')));

// Serve blockpacks (textures and block.json) directly from repo root
// Serve blockpacks from client public so block definitions and textures live together
app.use('/blockpacks', express.static(path.join(__dirname, './client/public/blockpacks')));

// Serve pack textures under /blockpacks/:pack/textures/* by proxying to the shared public textures folder
// This avoids duplicating binary files while allowing per-pack texture URLs like
// /blockpacks/grass/textures/grass_top.png
app.use('/blockpacks/:pack/textures', (req, res, next) => {
  return express.static(path.join(__dirname, './client/public/textures'))(req, res, next);
});

// Dynamic index for blockpacks: read each pack's block.json and return an array
// This allows authors to only place per-pack `block.json` files and not maintain a central index.
app.get('/blockpacks/index.json', (req, res) => {
  try {
    const packsDir = path.join(__dirname, './client/public/blockpacks');
    if (!fs.existsSync(packsDir)) return res.json([]);
    const children = fs.readdirSync(packsDir, { withFileTypes: true });
    const out = [];
    for (const d of children) {
      if (!d.isDirectory()) continue;
      const pkgPath = path.join(packsDir, d.name, 'block.json');
      if (!fs.existsSync(pkgPath)) continue;
      try {
        const content = fs.readFileSync(pkgPath, 'utf8');
        const parsed = JSON.parse(content);
        out.push(parsed);
      } catch (fileErr) {
        console.error(`[SERVER] failed to read/parse block.json for pack '${d.name}' at ${pkgPath}:`, fileErr && fileErr.stack ? fileErr.stack : fileErr);
        // continue to next pack
      }
    }
    return res.json(out);
  } catch (e) {
    console.error('[SERVER] error building blockpacks index', e && e.stack ? e.stack : e);
    return res.status(500).json({ error: 'failed to build blockpacks index' });
  }
});

// Route de santé
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend Vaste opérationnel',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/game-servers', gameServerRoutes);

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  // Don't serve React app for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API endpoint not found' });
  }
  
  // Serve React app
  res.sendFile(path.join(__dirname, './client/dist/index.html'));
});

// Route 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint non trouvé'
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('[SERVER] Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message
  });
});

// Server startup
const startServer = async () => {
  try {
    // Database connection
    await connectDB();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`[SERVER] Backend Vaste started on port ${PORT}`);
      console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
      console.log(`[SERVER] API Auth: http://localhost:${PORT}/api/auth`);
      console.log(`[SERVER] API Servers: http://localhost:${PORT}/api/servers`);
    });
    
  } catch (error) {
    console.error('[SERVER] ❌ Startup error:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[SERVER] 🛑 SIGTERM signal received, shutting down server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SERVER] 🛑 SIGINT signal received, shutting down server...');
  process.exit(0);
});

// Start the server
startServer();