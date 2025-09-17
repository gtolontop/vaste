import express from 'express';
import { GameServer } from '../models/GameServer.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all public servers
router.get('/public', async (req, res) => {
  try {
    const servers = await GameServer.getPublicServers();
    res.json(servers);
  } catch (error) {
    console.error('Error fetching public servers:', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// Get user's servers
router.get('/my-servers', authenticateToken, async (req, res) => {
  try {
    const servers = await GameServer.getByOwner(req.user.id);
    res.json(servers);
  } catch (error) {
    console.error('Error fetching user servers:', error);
    res.status(500).json({ error: 'Failed to fetch your servers' });
  }
});

// Create new server
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { name, description, host, port, websocket_url, max_players, is_public, version, tags } = req.body;

    // Validation
    if (!name || !host || !port || !websocket_url || !max_players) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (max_players < 1 || max_players > 100) {
      return res.status(400).json({ error: 'Max players must be between 1 and 100' });
    }

    // Create server
    const server = await GameServer.create({
      name,
      description: description || '',
      host,
      port: parseInt(port),
      websocket_url,
      max_players: parseInt(max_players),
      owner_id: req.user.id,
      is_public: is_public !== false,
      version: version || '1.0.0',
      tags: tags || ''
    });

    res.status(201).json({
      message: 'Server created successfully',
      server: {
        ...server,
        // Return license key only on creation
        license_key: server.license_key
      }
    });
  } catch (error) {
    console.error('Error creating server:', error);
    res.status(500).json({ error: 'Failed to create server' });
  }
});

// Get server details (for owner only, includes license key)
router.get('/:uuid', authenticateToken, async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Only owner can see full details including license key
    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(server);
  } catch (error) {
    console.error('Error fetching server:', error);
    res.status(500).json({ error: 'Failed to fetch server' });
  }
});

// Update server
router.put('/:uuid', authenticateToken, async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, description, max_players, is_public, version, tags } = req.body;

    await server.update({
      name,
      description,
      max_players: max_players ? parseInt(max_players) : undefined,
      is_public,
      version,
      tags
    });

    res.json({ message: 'Server updated successfully', server });
  } catch (error) {
    console.error('Error updating server:', error);
    res.status(500).json({ error: 'Failed to update server' });
  }
});

// Delete server
router.delete('/:uuid', authenticateToken, async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await server.delete();
    res.json({ message: 'Server deleted successfully' });
  } catch (error) {
    console.error('Error deleting server:', error);
    res.status(500).json({ error: 'Failed to delete server' });
  }
});

// Validate license (for game servers to call)
router.post('/validate-license', async (req, res) => {
  try {
    const { license_key } = req.body;

    if (!license_key) {
      return res.status(400).json({ error: 'License key required' });
    }

    const validation = await GameServer.validateLicense(license_key);

    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    res.json({ 
      valid: true, 
      server: {
        uuid: validation.server.uuid,
        name: validation.server.name,
        description: validation.server.description,
        max_players: validation.server.max_players,
        license_expires_at: validation.server.license_expires_at
      }
    });
  } catch (error) {
    console.error('Error validating license:', error);
    res.status(500).json({ error: 'Failed to validate license' });
  }
});

// Update server status (heartbeat from game server)
router.post('/heartbeat', async (req, res) => {
  try {
    const { license_key, current_players } = req.body;

    if (!license_key) {
      return res.status(400).json({ error: 'License key required' });
    }

    const validation = await GameServer.validateLicense(license_key);

    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    await validation.server.updateStatus(true, current_players || 0);

    res.json({ message: 'Heartbeat received' });
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    res.status(500).json({ error: 'Failed to process heartbeat' });
  }
});

// Sync server settings (called by game server on startup)
router.post('/sync-settings', async (req, res) => {
  try {
    const { license_key, max_players, current_players } = req.body;

    if (!license_key) {
      return res.status(400).json({ error: 'License key required' });
    }

    const validation = await GameServer.validateLicense(license_key);

    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    // Update server max_players if provided
    if (max_players !== undefined) {
      await validation.server.updateMaxPlayers(max_players);
    }

    // Update current status
    await validation.server.updateStatus(true, current_players || 0);

    res.json({ 
      message: 'Settings synchronized successfully',
      server: {
        uuid: validation.server.uuid,
        name: validation.server.name,
        description: validation.server.description,
        max_players: validation.server.max_players,
        license_expires_at: validation.server.license_expires_at
      }
    });
  } catch (error) {
    console.error('Error syncing server settings:', error);
    res.status(500).json({ error: 'Failed to sync server settings' });
  }
});

// Renew license
router.post('/:uuid/renew-license', authenticateToken, async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await server.renewLicense();
    res.json({ message: 'License renewed successfully', server });
  } catch (error) {
    console.error('Error renewing license:', error);
    res.status(500).json({ error: 'Failed to renew license' });
  }
});

// Deactivate license
router.post('/:uuid/deactivate-license', authenticateToken, async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await server.deactivateLicense();
    res.json({ message: 'License deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating license:', error);
    res.status(500).json({ error: 'Failed to deactivate license' });
  }
});

// Reactivate license
router.post('/:uuid/reactivate-license', authenticateToken, async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await server.reactivateLicense();
    res.json({ message: 'License reactivated successfully' });
  } catch (error) {
    console.error('Error reactivating license:', error);
    res.status(500).json({ error: 'Failed to reactivate license' });
  }
});

export default router;